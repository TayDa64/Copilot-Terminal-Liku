// src/copilotHelper.ts
import * as vscode from 'vscode';
import * as os from 'os';

export class CopilotInteraction {

    private static smartTruncateOutput(fullOutput: string, maxLength: number = 2000, contextLines: number = 10): string {
        if (fullOutput.length <= maxLength) {
            return fullOutput;
        }

        const lines = fullOutput.split(/\r?\n/);
        if (lines.length <= contextLines * 2) {
            return `...\n${fullOutput.substring(fullOutput.length - maxLength)}`;
        }

        const firstNLines = lines.slice(0, contextLines).join('\n');
        const lastNLines = lines.slice(-contextLines).join('\n');
        const combined = `${firstNLines}\n...\n[Output Truncated - Middle Omitted]\n...\n${lastNLines}`;

        if (combined.length > maxLength) {
            return `...\n${combined.substring(combined.length - maxLength)}`;
        }
        return combined;
    }

    public static async sendToCopilotChat(command: string, exitCode: number, cwd: string, errorOutput: string): Promise<void> {
        console.log(`[Copilot Helper] sendToCopilotChat CALLED. Command: "${command}", ExitCode: ${exitCode}, CWD: "${cwd}", OutputLength: ${errorOutput.length}`); // ADDED CWD and OutputLength here
        console.log(`[Copilot Helper] Environment: OS: ${os.platform()}, Architecture: ${os.arch()}`); // ADDED OS and Architecture
        // console.log(`[Copilot Helper] Shell: ${process.env.SHELL || (os.platform() === 'win32' ? 'Windows Shell (Powershell/CMD)' : 'bash/zsh/default')}`); // ADDED SHELL
        // console.log(`[Copilot Helper] Error Output Length: ${errorOutput.length}`); // ADDED Error Output Length
        // console.log(`[Copilot Helper] Error Output: ${errorOutput}`); // ADDED Error Output
        // console.log(`[Copilot Helper] Command: ${command}`); // ADDED Command
        // console.log(`[Copilot Helper] Exit Code: ${exitCode}`); // ADDED Exit Code
        // console.log(`[Copilot Helper] CWD: ${cwd}`); // ADDED CWD
        try {
            const chatExtension = vscode.extensions.getExtension('github.copilot-chat');
            if (!chatExtension) {
                 console.warn("[Copilot Helper] GitHub Copilot Chat extension not found.");
                 vscode.window.showWarningMessage("GitHub Copilot Chat extension not found. Please ensure it's installed and enabled to use this feature.");
                 return;
            }
            console.log(`[Copilot Helper] Copilot Chat extension found. Active: ${chatExtension.isActive}`);

            console.log(`[Copilot Helper] Parameter - command: "${command}"`);
            console.log(`[Copilot Helper] Parameter - exitCode: ${exitCode}`);
            console.log(`[Copilot Helper] Parameter - cwd: "${cwd}"`);
            console.log(`[Copilot Helper] Parameter - errorOutput (first 50 chars): "${errorOutput.substring(0, 50)}"`);
             // --- END DEBUG LOGS ---

            const processedOutput = this.smartTruncateOutput(errorOutput || '[No output captured or output was empty]');
            // --- ADD DEBUG LOG FOR PROCESSED OUTPUT ---
            console.log(`[Copilot Helper] Processed Output (first 50 chars): "${processedOutput.substring(0, 50)}"`);
             // --- END DEBUG LOG ---

            const shell = process.env.SHELL || (os.platform() === 'win32' ? 'Windows Shell (Powershell/CMD)' : 'bash/zsh/default');
            const promptText = `Analyze the following terminal command failure and suggest solutions. Focus on the most likely cause and actionable steps.
**Command Executed:**
\`\`\`
${command}
\`\`\`

**Exit Code:** \`${exitCode}\`

**Working Directory:**
\`\`\`
${cwd}
\`\`\`

**Environment:**
*   OS: ${os.platform()} (${os.release()})
*   Architecture: ${os.arch()}
*   Shell: ${shell}

**Terminal Output (may be summarized/truncated):**
\`\`\`
${processedOutput}
\`\`\`
Please provide a concise explanation of the most likely cause and 1-3 specific commands or steps to resolve this error.`;
            // --- ADD DEBUG LOG FOR FINAL PROMPT ---
            console.log(`[Copilot Helper] Final promptText (first 300 chars):\n${promptText.substring(0, 300)}`);
             // --- END DEBUG LOG ---
            console.log("[Copilot Helper] Prompt constructed. Attempting to copy to clipboard...");
            await vscode.env.clipboard.writeText(promptText);
            console.log('[Copilot Helper] Prompt copied to clipboard successfully.');

            console.log("[Copilot Helper] Attempting to open/focus Copilot Chat view (without specific query)...");
            try {
                 await vscode.commands.executeCommand('workbench.action.chat.open');
                 console.log('[Copilot Helper] Executed "workbench.action.chat.open" command successfully.');
            } catch (openError) {
                 console.error('[Copilot Helper] CRITICAL ERROR trying to open chat view:', openError);
            }

            console.log("[Copilot Helper] Attempting to show information message...");
            vscode.window.showInformationMessage(
                "Liku: Prompt for failed command copied. Paste (Ctrl+V or Cmd+V) into the Copilot Chat window to get help.",
                { modal: false }
            );
            console.log("[Copilot Helper] Information message shown (or attempted).");

        } catch (error) {
            console.error("[Copilot Helper] CRITICAL ERROR in sendToCopilotChat:", error);
            vscode.window.showErrorMessage("Liku: Failed to prepare prompt for Copilot Chat. Please copy the error manually.");
        }
    }
}