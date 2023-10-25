# Development environment

We require `node` and `pnpm` to exist. If you're a nix user, we have a flake.nix present that installs the same version of the development tools we use for everyone.

# Building TypeScript

- You can run `pnpm build` to build all the projects in the repo
- You can run `pnpm watch` to start the TypeScript watcher process for all the projects in the repo which will recompile files as you change them

# Prereleasing

It can be annoying to work with these packages via `pnpm link` sometimes, so we also support building and releasing the package to a git SHA which can then be installed conventionally in another repo. To push a prerelease, run `p -F=opentelemetry-ws prerelease`. This will:

- build the typescript
- create a local git commit that has just the built artifacts for just the package in question
- push that to the remote git repo
- and log out a version you can then refer to from other repos

# Releasing

There's an automatic release process run by Github Actions. Bump the version in a package.json, and Github Actions will build and push to npm. Try to use this if possible.

If you need to release manually, you can do so with `pnpm`:

```
pnpm =F=opentelemetry-instrumentation-ws publish --access=public
```

to push a new version to NPM.
