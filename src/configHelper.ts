// src/configHelper.ts
import * as vscode from 'vscode';

export interface ExtensionConfig {
    enabled: boolean;
    ignoreExitCodes: number[];
    ignoreCommands: string[];
}

const CONFIG_SECTION = 'copilotTerminalLiku'; // Ensure this matches your package.json "contributes.configuration.title" derived ID

export function getExtensionConfig(): ExtensionConfig | undefined {
    try {
        const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
        const enabled = config.get<boolean>('enabled', true);
        const ignoreExitCodes = config.get<number[]>('ignoreExitCodes', [130]);
        const ignoreCommands = config.get<string[]>('ignoreCommands', []);

        if (!Array.isArray(ignoreExitCodes) || !Array.isArray(ignoreCommands)) {
            console.error(`[Config Helper] Invalid configuration format for ignore lists. Check settings for '${CONFIG_SECTION}'.`);
            return {
                 enabled: true,
                 ignoreExitCodes: [130],
                 ignoreCommands: []
             };
        }
        return { enabled, ignoreExitCodes, ignoreCommands };
    } catch (error) {
        console.error("[Config Helper] Error reading extension configuration:", error);
        return undefined;
    }
}