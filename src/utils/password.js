"use strict";
require("babel-polyfill");

// Tools for encrypting and decrypting passwords.
// Basically promise-friendly wrappers for bcrypt.
import bcrypt from 'bcrypt-nodejs';

// Returns a promise for a hashed password string.
export function hash(password) {
    return new Promise((resolve, reject) => {
        bcrypt.hash(password, null, null, (err, hashedPassword) => {
            if (err) {
                reject(err);
            } else {
                resolve(hashedPassword);
            }
        });
    });
}

// Returns a promise for whether this password compares to equal this
// hashed password.
export function compare(password, hashedPassword) {
    return new Promise((resolve, reject) => {
        bcrypt.compare(password, hashedPassword, (err, success) => {
            if (err) {
                reject(err);
            } else {
                resolve(success);
            }
        });
    });
}

export default {
    hash,
    compare
};
