// src/extension.ts
import * as vscode from 'vscode';
// Ensure correct path if filename is lowercase 'w'
//import { TerminalWatcher } from './terminalWatcher'; // Or './TerminalWatcher' if applicable
import { getExtensionConfig } from './configHelper';
import { CommandRunnerPty } from './commandRunnerPty';

// src/extension.ts

export function activate(context: vscode.ExtensionContext) {
    console.log('>>> CODESPACE LIKU: Activation function CALLED! <<<');
    console.log('[ACTIVATE] Extension "copilot-terminal-liku" starting activation...');

    try {
        const config = getExtensionConfig(); // Get config first

        // --- Add this check ---
        if (!config) {
             console.error("[ACTIVATE] Failed to load extension configuration. Extension will not run.");
             // Optionally show a message to the user
             // vscode.window.showErrorMessage("Copilot Terminal Liku failed to load configuration.");
             return; // Exit activation if config is invalid
        }
        // --- End check ---

        // Now 'config' is guaranteed to exist here
        if (config.enabled) {
            console.log('[ACTIVATE] Extension is enabled. Creating PTY runner setup...'); // Updated log message

            // --- Register Commands (moved inside the 'enabled' check) ---
            // src/extension.ts excerpt within activate function -> runCommand registration

    let runCommandDisposable = vscode.commands.registerCommand(
    'copilot-terminal-liku.runCommand',
    async () => {
        console.log('[COMMAND] runCommand callback executed.'); // This appears

        // 1. Get command from user
        const commandToRun = await vscode.window.showInputBox({
            prompt: "Enter the command to run and analyze on failure",
            placeHolder: "e.g., npm run build, git fetch, ./my_script.sh",
            ignoreFocusOut: true,
        });
        // --- ADD LOG ---
        console.log(`[COMMAND] User entered command: "${commandToRun || 'NULL/CANCELLED'}"`);

        if (!commandToRun) {
            console.log('[COMMAND] User cancelled input box.');
            return;
        }

        // 2. Determine Working Directory
        let cwd: string | undefined;
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            cwd = vscode.workspace.workspaceFolders[0].uri.fsPath;
        } else {
            console.warn("[COMMAND] No workspace folder open, using default CWD.");
        }
        // --- ADD LOG ---
        console.log(`[COMMAND] Determined CWD: "${cwd || 'default'}"`);

        // 3. Create and show the terminal with the PTY
        try {
            // --- ADD LOG ---
            console.log('[COMMAND] Creating CommandRunnerPty instance...');
            const pty = new CommandRunnerPty(commandToRun, cwd);
            // --- ADD LOG ---
            console.log('[COMMAND] CommandRunnerPty instance created. Creating terminal...');
            const terminal = vscode.window.createTerminal({
                name: `Liku Run: ${commandToRun.substring(0, 30)}...`,
                pty: pty // Pass the pty implementation
            });
            // --- ADD LOG ---
            console.log('[COMMAND] vscode.window.createTerminal finished. Showing terminal...');
            terminal.show(); // Explicitly call show()
            // --- ADD LOG ---
            console.log('[COMMAND] terminal.show() called.');
        } catch (error) {
             console.error('[COMMAND] CRITICAL ERROR during PTY/Terminal creation:', error); // Added prefix
             vscode.window.showErrorMessage(`Failed to run command: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
);
context.subscriptions.push(runCommandDisposable);
console.log('[ACTIVATE] Registered command: copilot-terminal-liku.runCommand');
        }
    } catch (error) {
        console.error('[ACTIVATE] Exception during activation:', error);
    }
}