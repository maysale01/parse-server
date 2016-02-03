class ParseApp {
    constructor(args) {
        // Backwards compatible
        if (args.appId && !args.applicationId) {
            args.applicationId = args.appId;
        }

        if (!args.applicationId || !args.masterKey) {
            throw 'You must provide an applicationId and masterKey!';
        }

        this._applicationId = args.applicationId;
        this._masterKey = args.masterKey;
        this._collectionPrefix = args.collectionPrefix || '';
        this._clientKey = args.clientKey || '';
        this._javascriptKey = args.javascriptKey || '';
        this._dotNetKey = args.dotNetKey || '';
        this._restAPIKey = args.restAPIKey || '';
        this._fileKey = args.fileKey || 'invalid-file-key';
        this._facebookAppIds = args.facebookAppIds || [];
        this._database = args.database;
    }

    get applicationId() {
        return this._applicationId;
    }

    get masterKey() {
        return this._masterKey;
    }

    get collectionPrefix() {
        return this._collectionPrefix;
    }

    get clientKey() {
        return this._clientKey;
    }

    get javascriptKey() {
        return this._javascriptKey;
    }

    get dotNetKey() {
        return this._dotNetKey;
    }

    get restAPIKey() {
        return this._restAPIKey;
    }

    get fileKey() {
        return this._fileKey;
    }

    get facebookAppIds() {
        return this._facebookAppIds;
    }

    get database() {
        return this._database;
    }

    set applicationId(value) {
        this._applicationId = value;
    }

    set masterKey(value) {
        this._masterKey = value;
    }

    set collectionPrefix(value) {
        this._collectionPrefix = value;
    }

    set clientKey(value) {
        this._clientKey = value;
    }

    set javascriptKey(value) {
        this._javascriptKey = value;
    }

    set dotNetKey(value) {
        this._dotNetKey = value;
    }

    set restAPIKey(value) {
        this._restAPIKey = value;
    }

    set fileKey(value) {
        this._fileKey = value;
    }

    set facebookAppIds(value) {
        this._facebookAppIds = value;
    }

    set database(value) {
        this._database = value;
    }
}

export default ParseApp;