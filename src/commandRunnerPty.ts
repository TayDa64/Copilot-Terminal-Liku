// src/commandRunnerPty.ts
import * as vscode from 'vscode';
import * as os from 'os';
import * as pty from 'node-pty';
import { getExtensionConfig, ExtensionConfig } from './configHelper'; // Import ExtensionConfig type
import { CopilotInteraction } from './copilotHelper';

export class CommandRunnerPty implements vscode.Pseudoterminal {
    private writeEmitter = new vscode.EventEmitter<string>();
    onDidWrite: vscode.Event<string> = this.writeEmitter.event;
    private closeEmitter = new vscode.EventEmitter<number | void>();
    onDidClose: vscode.Event<number | void> = this.closeEmitter.event;

    private ptyProcess: pty.IPty | null = null;
    private outputBuffer: string[] = [];
    private analysisTriggered: boolean = false;
    private initialCommandSent: boolean = false; // Flag to help with output cleaning

    constructor(private command: string, private cwd: string) { // cwd is now expected to be a string
         console.log(`[PTY CONSTRUCTOR] Command: "${this.command}", CWD: "${this.cwd}"`);
    }

    open(initialDimensions: vscode.TerminalDimensions | undefined): void {
        console.log("[PTY OPEN] Terminal opened via PTY.");
        this.writeEmitter.fire(`Liku Run: Starting command: ${this.command}\r\n\r\n`);

        const shell = os.platform() === 'win32' ? 'powershell.exe' : (process.env.SHELL || 'bash');
        const cols = initialDimensions?.columns || 80;
        const rows = initialDimensions?.rows || 24;

        try {
            console.log(`[PTY OPEN] Spawning PTY with shell: ${shell}, cols: ${cols}, rows: ${rows}, cwd: ${this.cwd}`);
            this.ptyProcess = pty.spawn(shell, [], {
                name: 'xterm-color',
                cols: cols,
                rows: rows,
                cwd: this.cwd,
                env: process.env as { [key: string]: string },
            });
            console.log("[PTY OPEN] PTY process spawned successfully.");

            this.ptyProcess.onData((data: string | Buffer) => {
                const dataString = typeof data === 'string' ? data : data.toString('utf8');
                // Only add to buffer if it's actual output, not our own command echo (heuristic)
                if (this.initialCommandSent && !dataString.trim().endsWith(this.command.trim()) && !dataString.trim().endsWith("exit $?")) {
                     this.outputBuffer.push(...dataString.split(/\r?\n/));
                } else if (!this.initialCommandSent && dataString.includes(this.command)) {
                    // A more robust way would be to wait for the first prompt AFTER sending command.
                    // For now, this heuristic might catch the command echo.
                }
                this.writeEmitter.fire(dataString);
            });

            this.ptyProcess.onExit(({ exitCode, signal }) => {
                console.log(`>>> PTY onExit EVENT FIRED! Raw ExitCode: ${exitCode}, Raw Signal: ${signal}, AnalysisTriggered: ${this.analysisTriggered}`);
                try {
                    const finalExitCodeLog = (exitCode === null || exitCode === undefined) && signal !== undefined ? `null (Signal: ${signal})` : exitCode;
                    console.log(`[PTY EXIT] Process exited. Effective ExitCode: ${finalExitCodeLog}, Signal: ${signal}`);

                    if (typeof exitCode === 'number') {
                        this.writeEmitter.fire(`\r\n\r\nCommand finished with exit code: ${exitCode}\r\n`);
                    } else if (signal !== undefined) {
                        this.writeEmitter.fire(`\r\n\r\nCommand terminated by signal: ${signal}\r\n`);
                    } else {
                        this.writeEmitter.fire(`\r\n\r\nCommand finished (unknown status).\r\n`);
                    }

                    if (!this.analysisTriggered && typeof exitCode === 'number' && exitCode !== 0) {
                        this.analysisTriggered = true;
                        console.log(`[PTY EXIT] Non-zero exit code detected (${exitCode}), calling handleFailure...`);
                        this.handleFailure(exitCode);
                    } else if (typeof exitCode === 'number' && exitCode === 0) {
                        console.log(`[PTY EXIT] Command Succeeded (Exit Code 0). Closing terminal.`);
                        this.closeEmitter.fire(exitCode);
                    } else if (this.analysisTriggered) {
                        console.log(`[PTY EXIT] Analysis already triggered for this PTY instance.`);
                    } else {
                        console.log(`[PTY EXIT] No action for exit code: ${exitCode}, signal: ${signal}.`);
                        if (!this.analysisTriggered) {
                            this.closeEmitter.fire(exitCode);
                        }
                    }
                } catch(exitHandlerError) {
                    console.error("!!! CRITICAL ERROR inside onExit handler !!!", exitHandlerError);
                     if (typeof exitCode === 'number') { this.closeEmitter.fire(exitCode); }
                     else { this.closeEmitter.fire(1); }
                }
            });

            const commandToSend = `${this.command}\r`;
            const exitCommand = `exit $?\r`;
            
            console.log(`[PTY OPEN] Writing command to PTY: ${JSON.stringify(commandToSend)}`);
            this.ptyProcess.write(commandToSend);
            this.initialCommandSent = true; // Mark that we've sent the main command
            
            setTimeout(() => {
                console.log(`[PTY OPEN] Writing exit command to PTY: ${JSON.stringify(exitCommand)}`);
                if (this.ptyProcess && !(this.ptyProcess as any)._processExitInProgress) {
                    this.ptyProcess.write(exitCommand);
                } else {
                    console.log("[PTY OPEN] PTY process already exited or exiting, not sending explicit exit command.");
                }
            }, 300); // Slightly longer delay for command to complete

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error("[PTY OPEN] CRITICAL Failed to spawn PTY process:", error);
            this.writeEmitter.fire(`\r\n\r\nERROR: Failed to start command runner: ${errorMessage}\r\n`);
            this.closeEmitter.fire(1);
        }
    }

    close(): void {
        console.log("[PTY CLOSE] Close requested by VS Code.");
        if (this.ptyProcess) {
            console.log("[PTY CLOSE] Killing PTY process.");
            this.ptyProcess.kill();
            this.ptyProcess = null;
        }
    }

    handleInput(data: string): void {
        this.ptyProcess?.write(data);
    }

    private async handleFailure(exitCode: number): Promise<void> {
        console.log(`>>> PTY handleFailure CALLED! ExitCode: ${exitCode}, Command: "${this.command}"`);
        console.log(`[PTY FAILURE] Handling failure with Exit Code ${exitCode}.`);
        const config = getExtensionConfig();
        if (!config) {
             console.error("[PTY FAILURE] Failed to get extension configuration.");
             return;
        }

        if (config.ignoreExitCodes.includes(exitCode)) {
            console.log(`[PTY FAILURE] Ignoring: Exit code ${exitCode} is in ignore list.`);
            this.writeEmitter.fire(`\r\nExit code ${exitCode} ignored by configuration.\r\n`);
            return;
        }
        if (config.ignoreCommands.includes(this.command)) {
            console.log(`[PTY FAILURE] Ignoring: Command "${this.command}" is in ignore list.`);
             this.writeEmitter.fire(`\r\nCommand "${this.command}" ignored by configuration.\r\n`);
            return;
        }

        const cwd = this.cwd; // this.cwd is now guaranteed to be string

        // Attempt to clean the outputBuffer by removing echoed commands
        // This is heuristic and might need significant refinement.
        let outputLines = this.outputBuffer;
        const commandEchoIndex = outputLines.findIndex(line => line.includes(this.command));
        if (commandEchoIndex !== -1) {
            // Attempt to remove the command echo and everything before it, plus the prompt line
            // This assumes the prompt is the line just before the command echo.
            outputLines = outputLines.slice(commandEchoIndex + 1);
        }
        // Attempt to remove trailing 'exit $?' and 'exit' and the prompt before them
        const lastLines = outputLines.slice(-5).join('\n'); // Look at last few lines
        const exitPattern = /\r?\n?[^\r\n]*\$ exit \$\?\s*(\r?\n)+exit\s*$/;
        if (exitPattern.test(lastLines)) {
            // This is tricky; for simplicity, we might just trim the last few lines if they match "exit"
            if (outputLines.length > 2 && outputLines[outputLines.length - 1].trim() === 'exit' && outputLines[outputLines.length - 2].trim() === 'exit $?') {
                 outputLines = outputLines.slice(0, -2);
            } else if (outputLines.length > 1 && outputLines[outputLines.length-1].trim() === 'exit') {
                 outputLines = outputLines.slice(0,-1);
            }
        }


        const fullOutput = outputLines
            .map(line => line.trimEnd())
            .reduce((acc: string[], line: string) => {
                 if (line.trim() !== '' || (acc.length > 0 && acc[acc.length - 1]?.trim() !== '')) {
                     acc.push(line);
                 }
                 return acc;
             }, [])
            .join('\n')
            .trim();

        console.log(`--- DEBUG PTY handleFailure Values ---`);
        console.log(`Command: "${this.command}"`);
        console.log(`CWD: "${cwd}"`);
        console.log(`Cleaned Full Output (first 200 chars): "${fullOutput.substring(0, 200)}"`);
        console.log(`Cleaned Full Output Length: ${fullOutput.length}`);
        console.log(`--- END DEBUG PTY handleFailure Values ---`);

        console.log(`[PTY FAILURE] Triggering Copilot analysis for command: ${this.command}`);

        try {
            if (typeof CopilotInteraction?.sendToCopilotChat === 'function') {
                 await CopilotInteraction.sendToCopilotChat(
                    this.command,
                    exitCode,
                    cwd,
                    fullOutput
                );
                 this.writeEmitter.fire(`\r\nCopilot prompt prepared (check notifications).\r\n`);
            } else {
                 console.error("[PTY FAILURE] CopilotInteraction.sendToCopilotChat is not available!");
                 this.writeEmitter.fire(`\r\nERROR: Copilot interaction helper is missing.\r\n`);
            }
        } catch (error) {
             console.error("[PTY FAILURE] Error triggering Copilot interaction:", error);
              this.writeEmitter.fire(`\r\nERROR: Failed to send details to Copilot Chat.\r\n`);
        }
    }
}