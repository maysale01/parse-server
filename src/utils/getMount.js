"use strict";
require("babel-polyfill");

// Gets the API mount path from the Express req object
export default function(req) {
    let mountPathLength = req.originalUrl.length - req.url.length;
    let mountPath = req.originalUrl.slice(0, mountPathLength);
    let mount = req.protocol + '://' + req.get('host') + mountPath;
    return mount;
}