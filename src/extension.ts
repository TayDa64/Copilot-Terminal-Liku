// src/extension.ts
import * as vscode from 'vscode';
import * as os from 'os'; // For os.homedir() if no workspace is open
import { CommandRunnerPty } from './commandRunnerPty';
import { getExtensionConfig } from './configHelper';

export function activate(context: vscode.ExtensionContext) {
    console.log('>>> CODESPACE LIKU: Activation function CALLED! <<<');
    console.log('[ACTIVATE] Extension "copilot-terminal-liku" starting activation...');

    try {
        const config = getExtensionConfig();

        if (!config) {
             console.error("[ACTIVATE] Failed to load extension configuration. Extension will not run effectively.");
             // Allow activation but commands might not behave as expected if config is needed early
             // Or decide to return if config is absolutely critical for any command registration
        }

        // Even if config fails to load, we register commands,
        // but their behavior might use defaults or log errors.
        if (config?.enabled !== false) { // Proceed if enabled or config failed (defaults to enabled)
            if (config) {
                console.log('[ACTIVATE] Extension is enabled (or config loaded). Creating PTY runner setup...');
            } else {
                console.warn('[ACTIVATE] Config failed to load, proceeding with default enabled state.');
            }


            // --- Main Command to Run via PTY ---
            let runCommandDisposable = vscode.commands.registerCommand('copilot-terminal-liku.runCommand', async () => {
                console.log('[COMMAND] runCommand callback executed.');

                const commandToRun = await vscode.window.showInputBox({
                    prompt: "Enter the command to run and analyze on failure",
                    placeHolder: "e.g., npm run build, git fetch, ./my_script.sh",
                    ignoreFocusOut: true,
                });
                console.log(`[COMMAND] User entered command: "${commandToRun || 'NULL/CANCELLED'}"`);

                if (!commandToRun) {
                    console.log('[COMMAND] User cancelled input box.');
                    return;
                }

                let effectiveCwd: string;
                if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                    effectiveCwd = vscode.workspace.workspaceFolders[0].uri.fsPath;
                } else {
                    console.warn("[COMMAND] No workspace folder open. Using user's home directory as CWD.");
                    effectiveCwd = os.homedir(); // Default to user's home directory
                }
                console.log(`[COMMAND] Determined CWD for PTY: "${effectiveCwd}"`);

                try {
                    console.log('[COMMAND] Creating CommandRunnerPty instance...');
                    const pty = new CommandRunnerPty(commandToRun, effectiveCwd); // Pass effectiveCwd
                    console.log('[COMMAND] CommandRunnerPty instance created. Creating terminal...');
                    const terminal = vscode.window.createTerminal({
                        name: `Liku Run: ${commandToRun.substring(0, 30)}...`,
                        pty: pty
                    });
                    console.log('[COMMAND] vscode.window.createTerminal finished. Showing terminal...');
                    terminal.show();
                    console.log('[COMMAND] terminal.show() called.');
                } catch (error) {
                     console.error('[COMMAND] CRITICAL ERROR during PTY/Terminal creation:', error);
                     vscode.window.showErrorMessage(`Failed to run command: ${error instanceof Error ? error.message : String(error)}`);
                }
            });
            context.subscriptions.push(runCommandDisposable);
            console.log('[ACTIVATE] Registered command: copilot-terminal-liku.runCommand');

            // --- Fallback Command ---
            let analyzeLastDisposable = vscode.commands.registerCommand('copilot-terminal-liku.analyzeLast', () => {
                console.log('[COMMAND] analyzeLast callback executed.');
                vscode.window.showInformationMessage("Liku: 'Analyze Last Error' is not fully implemented. Use 'Liku: Run Command...' to execute and analyze.");
            });
            context.subscriptions.push(analyzeLastDisposable);
            console.log('[ACTIVATE] Registered command: copilot-terminal-liku.analyzeLast');

            console.log('[ACTIVATE] Command runners registered.');

        } else if (config && !config.enabled) { // Explicitly check if config exists and enabled is false
            console.log('[ACTIVATE] Extension is disabled in settings.');
        }

    } catch (error) {
        console.error('[ACTIVATE] CRITICAL ERROR during activation:', error);
        vscode.window.showErrorMessage("Failed to activate Copilot Terminal Liku. Check Debug Console.");
    }
    console.log('[ACTIVATE] Activation function finished.');
}

export function deactivate() {
    console.log('[DEACTIVATE] Copilot Terminal Liku deactivated.');
}