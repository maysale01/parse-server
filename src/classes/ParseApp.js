class ParseApp {
    constructor(args) {
        if (!args.appId || !args.masterKey) {
            throw 'You must provide an appId and masterKey!';
        }

        this._appId = args.appId;
        this._masterKey = args.masterKey;
        this._collectionPrefix = args.collectionPrefix || '';
        this._clientKey = args.clientKey || '';
        this._javascriptKey = args.javascriptKey || '';
        this._dotNetKey = args.dotNetKey || '';
        this._restAPIKey = args.restAPIKey || '';
        this._fileKey = args.fileKey || 'invalid-file-key';
        this._facebookAppIds = args.facebookAppIds || [];
    }

    get id() {
        return this._appId;
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

    set id(value) {
        this._appId = value;
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
}

export default ParseApp;