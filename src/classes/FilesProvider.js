export default class FilesProvider {
    constructor(adapter) {
        if (typeof adapter === 'function') {
            this._adapterClass = adapter;
            this._adapter = new adapterClass();
        } else {
            this._adapter = adapter;
        }
    }

    setAdapter(filesAdapter) {
        this._adapter = filesAdapter;
    }

    getAdapter() {
        return this._adapter;
    }
} 
