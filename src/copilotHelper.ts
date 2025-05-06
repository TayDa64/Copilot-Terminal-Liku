// src/copilotHelper.ts
import * as vscode from 'vscode';
import * as os from 'os';

export class CopilotInteraction {

    public static async sendToCopilotChat(command: string, exitCode: number, cwd: string, errorOutput: string): Promise<void> {
        try {
            // --- Check if Copilot Chat Extension is active ---
            const chatExtension = vscode.extensions.getExtension('github.copilot-chat');
            if (!chatExtension?.isActive) {
                // Attempt to activate it - this might not be reliable or immediate
                // await chatExtension?.activate();
                // If activation is complex, just warn the user
                vscode.window.showWarningMessage("GitHub Copilot Chat extension is not active. Please ensure it's enabled and ready.");
                // Optionally, try opening it anyway, it might activate on open
            }

            // --- Construct the Prompt ---
            const shell = process.env.SHELL || os.platform();
            const contextPrompt = `
Analyze the following terminal command failure and suggest solutions:

**Command:**
\`\`\`bash
${command}
\`\`\`

**Exit Code:** ${exitCode}

**Working Directory:**
\`\`\`
${cwd}
\`\`\`

**Environment:**
* OS: ${os.platform()} (${os.release()})
* Shell: ${shell}

**Terminal Output:**
\`\`\`
${errorOutput}
\`\`\`
`;

            // --- Attempt to Send/Focus Chat ---

            // Method A: Try to use context variables (needs verification if these context keys work)
            // await vscode.commands.executeCommand('setContext', 'github.copilot.chat.terminalErrorCommand', command);
            // await vscode.commands.executeCommand('setContext', 'github.copilot.chat.terminalErrorCode', exitCode);
            // await vscode.commands.executeCommand('setContext', 'github.copilot.chat.terminalErrorOutput', errorOutput);
            // await vscode.commands.executeCommand('setContext', 'github.copilot.chat.terminalErrorCwd', cwd);

            // Then open chat, perhaps pre-filled with a query asking to use context
             await vscode.commands.executeCommand('workbench.action.chat.open', { query: '/explain #terminalOutput' }); // Example query using potential context - NEEDS TESTING

            // Method B: Fallback to Clipboard if Method A isn't viable or fails
            // (We'll implement this as the primary for now due to uncertainty of Method A)

            // 1. Copy prompt to clipboard
            await vscode.env.clipboard.writeText(contextPrompt);

            // 2. Open Copilot Chat view (attempts to bring it to focus)
            await vscode.commands.executeCommand('workbench.action.chat.open');

             // 3. Show clear notification
            vscode.window.showInformationMessage("Copilot prompt for failed command copied. Paste (Ctrl+V) into the Chat window and send.");


        } catch (error) {
            console.error("Error interacting with Copilot Chat:", error);
            vscode.window.showErrorMessage("Failed to prepare prompt for Copilot Chat. Please copy the error manually.");
        }
    }
}