"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = getClassName;
function getClassName(parseClass) {
    if (parseClass && parseClass.className) {
        return parseClass.className;
    }
    return parseClass;
}