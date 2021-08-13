// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { WebSocketEvent } from './common/webviewEvents';

export type IDevToolsPostMessageCallback = (e: WebSocketEvent, message?: string) => void;

export interface BrowserVersionCdpResponse {
   id: number;
   result?: {
       product?: string;
       revision?: string;
   }
}

const MIN_SUPPORTED_VERSION = '94.0.975.0';

export class BrowserVersionDetectionSocket extends EventEmitter {
    private readonly targetUrl: string;
    private socket: WebSocket | undefined;

    constructor(targetUrl: string) {
        super();
        this.targetUrl = targetUrl;
    }

    dispose(): void {
        if (this.socket) {
            this.socket.close();
            this.socket = undefined;
        }
    }

    detectVersion(): void {
        // Connect to target to determine browser version
        this.socket = new WebSocket(this.targetUrl);
        this.socket.onopen = () => this.onOpen();
        this.socket.onmessage = ev => this.onMessage(ev);
    }

    private onOpen(): void {
        // Send request to get browser version
        const requestMessage = {
            id: 0,
            method: 'Browser.getVersion',
            params: {},
        };
        if (this.socket) {
            this.socket.send(JSON.stringify(requestMessage));
        }
    }

    private onMessage(message: { data: WebSocket.Data }) {
        // Determine if this is the browser.getVersion response and send revision hash to devtoolsPanel
        const data = JSON.parse(message.data.toString()) as BrowserVersionCdpResponse;
        this.emit('setBrowserRevision', this.calcBrowserRevision(data));
        // Dispose socket after version is determined
        this.dispose();
        return;
    }

    private calcBrowserRevision(data: BrowserVersionCdpResponse): string {
        if (data.id !== 0 || !data.result || !data.result.product && !data.result.revision) {
            return '';
        }
        // product in the form [Edg, HeadlessEdg]/#.#.#.#
        const versionNum = (data.result.product as string).split('/')[1];
        const currentVersion = versionNum.split('.');
        const minSupportedVersion = MIN_SUPPORTED_VERSION;
        const currentRevision = data.result.revision || '';
        for (let i = 0; i < currentVersion.length; i++) {
            // Loop through from Major to minor numbers
            if (currentVersion[i] > minSupportedVersion[i]) {
                return currentRevision;
            } else if (currentVersion[i] < minSupportedVersion[i]) {
                return '';
            }
            // Continue to the next number
        }
        // All numbers matched, return supported revision
        return currentRevision;
    }
}
