// Mounts a handler onto a PromiseRouter.
export default function mountOnto(router, method, path, handler) {
    router.route(method, path, (req) => {
        return handler(router, req);
    });
}