class CacheProvider {
    constructor(cache) {
        this._cache = cache;
    }

    getCache() {
        return this._cache;
    }

    setCache(cache) {
        this._cache = cache;
    }

}

export default CacheProvider;