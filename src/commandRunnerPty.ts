// src/commandRunnerPty.ts
import * as vscode from 'vscode';
import * as os from 'os';
import * as pty from 'node-pty';
import { getExtensionConfig } from './configHelper';
import { CopilotInteraction } from './copilotHelper';

export class CommandRunnerPty implements vscode.Pseudoterminal {
    private writeEmitter = new vscode.EventEmitter<string>();
    onDidWrite: vscode.Event<string> = this.writeEmitter.event;
    private closeEmitter = new vscode.EventEmitter<number | void>();
    onDidClose: vscode.Event<number | void> = this.closeEmitter.event;

    private ptyProcess: pty.IPty | null = null;
    private outputBuffer: string[] = [];
    private fullRawOutput: string = '';
    private analysisTriggered: boolean = false;

    constructor(private command: string, private cwd?: string) {
         console.log(`[PTY CONSTRUCTOR] Command: "${this.command}", CWD: "${this.cwd || 'default'}"`);
    }

    open(initialDimensions: vscode.TerminalDimensions | undefined): void {
        console.log("[PTY OPEN] Terminal opened via PTY.");
        this.writeEmitter.fire(`Starting command: ${this.command}\r\n\r\n`); // Added extra newline for clarity

        const shell = os.platform() === 'win32' ? 'powershell.exe' : (process.env.SHELL || 'bash');
        const cols = initialDimensions?.columns || 80;
        const rows = initialDimensions?.rows || 24; // Default rows

        try {
            console.log(`[PTY OPEN] Spawning PTY with shell: ${shell}, cols: ${cols}, rows: ${rows}, cwd: ${this.cwd || process.cwd()}`);
            this.ptyProcess = pty.spawn(shell, [], {
                name: 'xterm-color',
                cols: cols,
                rows: rows,
                cwd: this.cwd || process.cwd(),
                env: process.env as { [key: string]: string },
            });
            console.log("[PTY OPEN] PTY process spawned successfully.");

            this.ptyProcess.onData((data: string | Buffer) => {
                const dataString = typeof data === 'string' ? data : data.toString('utf8');
                this.outputBuffer.push(...dataString.split(/\r?\n/));
                this.fullRawOutput += dataString;
                this.writeEmitter.fire(dataString);
            });

            // --- REFINED onExit HANDLER ---
            this.ptyProcess.onExit(({ exitCode, signal }) => {
                console.log(`>>> PTY onExit EVENT FIRED! Raw ExitCode: ${exitCode}, Raw Signal: ${signal}, AnalysisTriggered: ${this.analysisTriggered}`);

                try {
                    const finalExitCodeLog = (exitCode === null || exitCode === undefined) && signal !== undefined ? `null (Signal: ${signal})` : exitCode;
                    console.log(`[PTY EXIT] Process exited. Effective ExitCode: ${finalExitCodeLog}, Signal: ${signal}`);

                    // Only write "Command finished" message if exitCode is numeric
                    if (typeof exitCode === 'number') {
                        this.writeEmitter.fire(`\r\n\r\nCommand finished with exit code: ${exitCode}\r\n`);
                    } else if (signal !== undefined) {
                        this.writeEmitter.fire(`\r\n\r\nCommand terminated by signal: ${signal}\r\n`);
                    } else {
                        this.writeEmitter.fire(`\r\n\r\nCommand finished (unknown status).\r\n`);
                    }

                    // Handle actual command failure (non-zero numeric exit code)
                    if (!this.analysisTriggered && typeof exitCode === 'number' && exitCode !== 0) {
                        this.analysisTriggered = true;
                        console.log(`[PTY EXIT] Non-zero exit code detected (${exitCode}), calling handleFailure...`);
                        this.handleFailure(exitCode); // Call the original handleFailure method
                    } else if (typeof exitCode === 'number' && exitCode === 0) {
                        console.log(`[PTY EXIT] Command Succeeded (Exit Code 0). Closing terminal.`);
                        this.closeEmitter.fire(exitCode); // Close successful terminal
                    } else if (this.analysisTriggered) {
                        console.log(`[PTY EXIT] Analysis already triggered for this PTY instance.`);
                    } else {
                        console.log(`[PTY EXIT] No action for exit code: ${exitCode}, signal: ${signal}.`);
                         // If not a clear success or failure we want to handle, just close.
                         // Or leave open if signal occurred? For now, close if not a handled failure.
                        if (!this.analysisTriggered) { // Ensure we don't close if failure handling is pending/active
                            this.closeEmitter.fire(exitCode);
                        }
                    }
                } catch(exitHandlerError) {
                    console.error("!!! CRITICAL ERROR inside onExit handler !!!", exitHandlerError);
                     if (typeof exitCode === 'number') { this.closeEmitter.fire(exitCode); }
                     else { this.closeEmitter.fire(1); } // Generic error
                }
            });
            // --- END REFINED onExit HANDLER ---

            // --- Send the actual command AND THEN 'exit $?' ---
            const commandToSend = `${this.command}\r`;
            const exitCommand = `exit $?\r`; // Exit with the previous command's exit code
            
            console.log(`[PTY OPEN] Writing command to PTY: ${JSON.stringify(commandToSend)}`);
            this.ptyProcess.write(commandToSend);
            
            setTimeout(() => {
                console.log(`[PTY OPEN] Writing exit command to PTY: ${JSON.stringify(exitCommand)}`);
                if (this.ptyProcess && !(this.ptyProcess as any)._processExitInProgress) { // Basic check if pty is still "alive"
                    this.ptyProcess.write(exitCommand);
                } else {
                    console.log("[PTY OPEN] PTY process already exited or exiting, not sending explicit exit command.");
                }
            }, 250); // Increased delay slightly, can be tuned

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
        // Note: onDidClose emitter should ideally be fired by onExit now.
        // Firing it here might be redundant or cause issues if onExit also fires it.
        // Let's rely on onExit to signal closure.
    }

    handleInput(data: string): void {
        this.ptyProcess?.write(data);
    }

    // --- Failure Handling Logic (Unchanged - the one that calls CopilotInteraction) ---
    private async handleFailure(exitCode: number): Promise<void> {
        console.log(`>>> PTY handleFailure CALLED! ExitCode: ${exitCode}, Command: "${this.command}"`); // Ensure this is the first log
        console.log(`[PTY FAILURE] Handling failure with Exit Code ${exitCode}.`); // Original log
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

        const cwd = this.cwd || '[Working Directory Not Determined]';
        const fullOutput = this.outputBuffer
            .map(line => line.trimEnd())
            .reduce((acc: string[], line: string) => {
                 if (line.trim() !== '' || (acc.length > 0 && acc[acc.length - 1]?.trim() !== '')) {
                     acc.push(line);
                 }
                 return acc;
             }, [])
            .join('\n')
            .trim();

        const maxOutputLength = 2000;
        const truncatedOutput = fullOutput.length > maxOutputLength
            ? `...\n${fullOutput.substring(fullOutput.length - maxOutputLength)}`
            : fullOutput;

        console.log(`[PTY FAILURE] Triggering Copilot analysis for command: ${this.command}`);

        try {
            if (typeof CopilotInteraction?.sendToCopilotChat === 'function') {
                 await CopilotInteraction.sendToCopilotChat(
                    this.command, exitCode, cwd, truncatedOutput
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
        // Do not call this.closeEmitter.fire() here if you want failed terminals to stay open
        // for user inspection and to see the "Copilot prompt prepared" message.
        // The user can manually close the "Liku Run: ..." terminal.
    }
}