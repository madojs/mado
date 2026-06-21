# Nginx Container Recipe

Optional static deployment recipe for a generated Mado app.

Copy this directory into your app as `docker/`, then build from the app root:

```bash
docker build -f docker/Containerfile -t myapp .
docker run --rm -p 8080:80 myapp
```

The container runs `npm run release` and serves the resulting `out/` directory
with nginx. This is a recipe, not a framework runtime requirement.
