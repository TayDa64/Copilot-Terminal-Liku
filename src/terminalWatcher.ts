// // src/terminalWatcher.ts
// // Import the proposed API for onDidWriteTerminalData
// import * as vscode from 'vscode';
// import '@vscode/proposed/terminalDataWrite';
// // Make sure these paths are correct for your project structure
// import { getExtensionConfig } from './configHelper';
// import { CopilotInteraction } from './copilotHelper';

// interface TerminalState {
//     dataBuffer: string;
//     isExecutingCommand: boolean;
//     currentCommand: string | undefined;
//     currentCwd: string | undefined;
//     outputBuffer: string[];
// }

// // OSC Regex remains the same
// const oscSequenceRegex = /\x1b]633;([A-E])(?:;(.*?))?(?:\x07|\x1b\\)/g;

// export class TerminalWatcher implements vscode.Disposable {
//     private terminalStates: Map<vscode.Terminal, TerminalState> = new Map();
//     private disposables: vscode.Disposable[] = [];

//     constructor(private context: vscode.ExtensionContext) {
//         console.log('[CONSTRUCTOR] TerminalWatcher constructor called.');
//         try {
//              this.initialize();
//         } catch(error) {
//             console.error('[CONSTRUCTOR] CRITICAL ERROR during initialize call:', error);
//         }
//     }

//     private initialize(): void {
//         console.log('[INITIALIZE] TerminalWatcher initialize() started.');
//         try {
//             // Handle Existing and Newly Opened Terminals
//             console.log('[INITIALIZE] Setting up existing terminals...');
//             vscode.window.terminals.forEach(terminal => this.setupTerminal(terminal));
//             console.log('[INITIALIZE] Subscribing to onDidOpenTerminal...');
//             this.disposables.push(vscode.window.onDidOpenTerminal(this.setupTerminal, this));
//             console.log('[INITIALIZE] Subscribing to onDidCloseTerminal...');
//             this.disposables.push(vscode.window.onDidCloseTerminal(this.cleanupTerminal, this));

//             // Listen to Terminal Data - ** STANDARD API USAGE **
//             console.log('[INITIALIZE] Subscribing to onDidWriteTerminalData API (using standard call)...');
//             this.disposables.push(
//                 // Use the proposed API by casting window to any
//                 (vscode.window as any).onDidWriteTerminalData((e: any) => {
//                     // Log that the listener fired
//                     console.log(`[onDidWriteTerminalData CALLED] Terminal: ${e.terminal.name}, Data length: ${e.data.length}`);

//                     const state = this.terminalStates.get(e.terminal);
//                     if (!state) {
//                         console.warn(`[onDidWriteTerminalData] State not found for terminal: ${e.terminal.name}. Ignoring data.`);
//                         return;
//                     }

//                     state.dataBuffer += e.data;
//                     // console.log(`[RAW DATA terminal=${e.terminal.name}] ${JSON.stringify(e.data)}`); // Keep commented unless needed

//                     let bufferDirty = false;
//                     let lastIndex = 0;
//                     const stickyRegex = new RegExp(oscSequenceRegex.source, 'gy');

//                     while (true) {
//                         stickyRegex.lastIndex = lastIndex;
//                         const match = stickyRegex.exec(state.dataBuffer);

//                         if (!match) {
//                             if (state.isExecutingCommand && lastIndex < state.dataBuffer.length) {
//                                 const outputChunk = state.dataBuffer.substring(lastIndex);
//                                 this.appendOutput(state, outputChunk);
//                             }
//                             break;
//                         }

//                         const startIndex = match.index;
//                         const endIndex = stickyRegex.lastIndex;

//                         if (state.isExecutingCommand && startIndex > lastIndex) {
//                             const outputChunk = state.dataBuffer.substring(lastIndex, startIndex);
//                             this.appendOutput(state, outputChunk);
//                         }

//                         const commandCode = match[1];
//                         const parameters = match[2];
//                         console.log(`[PARSED OSC] Code=${commandCode}, Params=${parameters !== undefined ? `"${parameters}"` : 'N/A'}, Index=${startIndex}`);
//                         this.handleOscSequence(e.terminal, state, commandCode, parameters);

//                         lastIndex = endIndex;
//                         bufferDirty = true;
//                     } // End while loop

//                     if (bufferDirty && lastIndex > 0) {
//                         state.dataBuffer = state.dataBuffer.substring(lastIndex);
//                     }

//                     const MAX_BUFFER = 1024 * 10; // 10KB limit
//                     if (state.dataBuffer.length > MAX_BUFFER) {
//                         console.warn(`[onDidWriteTerminalData] TerminalWatcher data buffer exceeded limit for terminal ${e.terminal.name}, truncating.`);
//                         state.dataBuffer = state.dataBuffer.substring(state.dataBuffer.length - MAX_BUFFER);
//                     }
//                 })
//             );
//             console.log("[INITIALIZE] Successfully subscribed to onDidWriteTerminalData.");

//         } catch(error) {
//              console.error('[INITIALIZE] CRITICAL ERROR during initialization steps:', error);
//              // Potentially show error message to user if needed
//              // vscode.window.showErrorMessage("Failed to initialize terminal watcher.");
//         }

//         console.log("[INITIALIZE] TerminalWatcher initialize() finished.");
//     }

//     // Helper to append output (Unchanged)
//     private appendOutput(state: TerminalState, text: string): void {
//         if (!text) return;
//         state.outputBuffer.push(...text.split(/\r?\n/));
//         // console.log(`[OUTPUT APPENDED] Text length: ${text.length}, Preview: ${JSON.stringify(text.substring(0, 50))}`);
//     }

//     // Process a detected OSC 633 sequence (Unchanged)
//     private handleOscSequence(terminal: vscode.Terminal, state: TerminalState, commandCode: string, parameters: string | undefined): void {
//         console.log(`[HANDLE OSC] Code=${commandCode}, Params=${parameters !== undefined ? `"${parameters}"` : 'N/A'}`);

//         switch (commandCode) {
//             case 'A':
//                 console.log("[HANDLE OSC] Command Start (A)");
//                 state.isExecutingCommand = true;
//                 state.outputBuffer = [];
//                 state.currentCommand = undefined;
//                 state.currentCwd = undefined;
//                 break;
//             case 'B':
//                 console.log(`[HANDLE OSC] CWD (B): ${parameters}`);
//                 state.currentCwd = parameters;
//                 break;
//             case 'D':
//                 const exitCode = parameters ? parseInt(parameters.trim(), 10) : undefined;
//                 console.log(`[HANDLE OSC] Command Finished (D). Exit Code Raw: "${parameters}", Parsed: ${exitCode}`);
//                 if (exitCode === undefined || isNaN(exitCode)) {
//                      console.warn(`[HANDLE OSC] Failed to parse exit code from D sequence: "${parameters}" for terminal ${terminal.name}`);
//                 }
//                 state.isExecutingCommand = false; // Set isExecutingCommand false *before* potentially delaying
//                 if (exitCode !== undefined && !isNaN(exitCode) && exitCode !== 0) {
//                     // Short delay remains reasonable
//                     setTimeout(() => {
//                          this.triggerCopilotAnalysis(terminal, state, exitCode);
//                     }, 50);
//                 } else if (exitCode === 0) {
//                      console.log(`[HANDLE OSC] Command Succeeded (Exit Code 0).`);
//                 }
//                 break;
//             case 'E':
//                 console.log(`[HANDLE OSC] Command Line (E): ${parameters}`);
//                 state.currentCommand = parameters;
//                 break;
//             case 'C': break; // Ignore cursor
//             default:
//                 console.warn(`[HANDLE OSC] Unknown OSC 633 command code: ${commandCode}`);
//         }
//     }

//     // Setup state tracking (Unchanged)
//     private setupTerminal(terminal: vscode.Terminal): void {
//         if (this.terminalStates.has(terminal)) {
//             console.log(`[SETUP] State already exists for terminal: ${terminal.name}. Skipping setup.`);
//             return;
//         }
//         console.log(`[SETUP] Setting up state for terminal: ${terminal.name}`);
//         this.terminalStates.set(terminal, {
//             dataBuffer: '',
//             isExecutingCommand: false,
//             currentCommand: undefined,
//             currentCwd: undefined,
//             outputBuffer: [],
//         });
//     }

//      // Cleanup state (Unchanged)
//     private cleanupTerminal(terminal: vscode.Terminal): void {
//          console.log(`[CLEANUP] Cleaning up state for closed terminal: ${terminal.name}`);
//          this.terminalStates.delete(terminal);
//      }

//     // Dispose resources (Unchanged)
//     dispose(): void {
//         console.log("Disposing TerminalWatcher resources.");
//         this.disposables.forEach(d => d.dispose());
//         this.terminalStates.clear();
//     }

//     // Trigger Copilot analysis (Unchanged)
//     private async triggerCopilotAnalysis(terminal: vscode.Terminal, state: TerminalState, exitCode: number): Promise<void> {
//         console.log(`[TRIGGER ANALYSIS] Firing for Exit Code ${exitCode}. Command: "${state.currentCommand}", CWD: "${state.currentCwd}"`);
//         // Ensure config helper is imported correctly
//         const config = getExtensionConfig();
//         if (!config) {
//              console.error("[TRIGGER ANALYSIS] Failed to get extension configuration.");
//              return;
//         }

//         if (config.ignoreExitCodes.includes(exitCode)) {
//             console.log(`[TRIGGER ANALYSIS] Ignoring command failure: Exit code ${exitCode} is in ignore list.`);
//             return;
//         }
//         if (state.currentCommand && config.ignoreCommands.includes(state.currentCommand)) {
//             console.log(`[TRIGGER ANALYSIS] Ignoring command failure: Command "${state.currentCommand}" is in ignore list.`);
//             return;
//         }

//         const failedCommand = state.currentCommand || '[Command Line Not Captured]';
//         const cwd = state.currentCwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '[Working Directory Not Captured]';
//         const fullOutput = state.outputBuffer
//             .map(line => line.trimEnd())
//             .filter((line, index, arr) => line !== '' || (index > 0 && arr[index - 1] !== ''))
//             .join('\n')
//             .trim();
//         const maxOutputLength = 2000;
//         const truncatedOutput = fullOutput.length > maxOutputLength
//             ? `...\n${fullOutput.substring(fullOutput.length - maxOutputLength)}`
//             : fullOutput;

//         console.log(`[TRIGGER ANALYSIS] Prompting user for command: ${failedCommand} (Exit: ${exitCode}) in ${cwd}`);

//         const sendOption = "Send to Copilot Chat";
//         const dismissOption = "Dismiss";
//         const choice = await vscode.window.showWarningMessage(
//             `Command '${failedCommand}' failed (Exit Code: ${exitCode}). Send details to Copilot?`,
//             { modal: false },
//             sendOption,
//             dismissOption
//         );

//          if (choice !== sendOption) {
//             console.log("[TRIGGER ANALYSIS] User dismissed Copilot prompt.");
//             return;
//         }
//         console.log("[TRIGGER ANALYSIS] User confirmed. Sending to Copilot...");
//         try {
//              // Ensure CopilotInteraction helper is imported and available
//             if (typeof CopilotInteraction?.sendToCopilotChat === 'function') {
//                  await CopilotInteraction.sendToCopilotChat(
//                     failedCommand,
//                     exitCode,
//                     cwd,
//                     truncatedOutput
//                 );
//             } else {
//                  console.error("[TRIGGER ANALYSIS] CopilotInteraction.sendToCopilotChat is not available!");
//                  vscode.window.showErrorMessage("Error: Copilot interaction helper is missing.");
//             }
//         } catch (error) {
//              console.error("[TRIGGER ANALYSIS] Error triggering Copilot interaction:", error);
//              vscode.window.showErrorMessage("Failed to send details to Copilot Chat.");
//         }
//     }
// }