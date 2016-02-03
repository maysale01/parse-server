class CacheProvider {
    constructor(cache) {
        this._cache = cache;
    }

    registerApp(applicationId, app) {
        this._cache.registerApp(applicationId, app);
    }

    set cache(value) {
        this._cache = value;
    }

    get cache() {
        return this._cache;
    }

}

export default CacheProvider;