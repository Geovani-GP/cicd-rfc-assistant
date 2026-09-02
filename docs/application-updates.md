# Application Updates

The packaged CI/CD Assistant checks for an application update at startup. If a
newer release exists, it downloads it in the background and asks the user to
restart once the verified package is ready. Users never need to download an
installer manually.

The generic update endpoint is:

```text
https://cicd-rfc-converters-updates.geovani-cicd-rfc.workers.dev/app
```

It must expose the `latest.yml`, `latest-mac.yml`, or `latest-linux.yml` files
and every release asset named by those files. The Cloudflare Worker proxies
these files from GitHub Releases.

## Release procedure

1. Increase `version` in `package.json`.
2. Build signed and notarized macOS artifacts, signed Windows NSIS artifacts,
   and the Linux AppImage.
3. Run `npm run release:build`.
4. Publish the generated installers, blockmaps, and `latest*.yml` files as one
   GitHub Release. Never mix metadata and installers from different builds.
5. Test the installed previous version against the published release before a
   broad rollout.

macOS auto-updates require code signing and notarization. Windows updates
should use Authenticode signing. Do not publish unsigned application updates.
