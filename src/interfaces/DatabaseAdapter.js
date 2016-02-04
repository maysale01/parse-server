"use strict";
require("babel-polyfill");

export default class DatabaseAdapter {
    constructor() {
        // TODO: Add some param validation here?
    }

    connect() {
        throw new Error('You must override the connect method');
    }

    loadSchema() {
        throw new Error('You must override the loadSchema method');
    }

    create() {
        throw new Error('You must override the create method');
    }

    find() {
        throw new Error('You must override the find method');
    }

    update() {
        throw new Error('You must override the update method');
    }

    destroy() {
        throw new Error('You must override the destroy method');
    }
}