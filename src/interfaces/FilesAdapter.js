"use strict";
require("babel-polyfill");

export default class FilesAdapterInterface {
    create() {
        throw new Error('You must override the create method');
    }
    get() {
        throw new Error('You must override the get method');
    }
    location() {
        throw new Error('You must override the location method');
    }
}