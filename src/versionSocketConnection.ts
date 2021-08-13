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

export interface BrowserVersion {
    major: number;
    minor: number;
    revision: string;
}

const MIN_SUPPORTED_BROWSER: BrowserVersion = {
    major: 94,
    minor: 975,
    revision : '',
};

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
        // product in the form Edg/Major.0.Minor.0 or HeadlessEdg/Major.0.Minor.0
        const versionNum = (data.result.product as string).split('/')[1];
        const parts = versionNum.split('.');
        const currVersion: BrowserVersion = {
            major: parseInt(parts[0], 10),
            minor: parseInt(parts[2], 10),
            revision: data.result.revision || '',
        };
        if (currVersion.major > MIN_SUPPORTED_BROWSER.major || (currVersion.major === MIN_SUPPORTED_BROWSER.major && currVersion.minor >= MIN_SUPPORTED_BROWSER.minor)) {
            return currVersion.revision;
        }
        return '';
    }
}
