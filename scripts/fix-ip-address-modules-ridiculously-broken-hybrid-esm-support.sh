#!/bin/bash

# The ip-address module has some ridiculously broken support for ESM modules,
# and multiple attempts to fix it appear to have stalled:
#  - https://github.com/beaugunderson/ip-address/pull/148
#  - https://github.com/beaugunderson/ip-address/pull/156
#  etc
#
# In a nutshell, the ✨✨✨HYBRID✨✨✨ approach to ESM is a bash script
# that they didn't even bother to include in the npm package.
#
# https://github.com/beaugunderson/ip-address/blob/b1df15f99355bd4132b579a0db69238b563e9c39/.fix-package-types.sh
#
# This script:
#  - checks to see if `type: module` is defined in the top-level package.json,
#    like it's supposed to be in the first place. If it is, then it means the
#    package has been fixed upstream, and no further action is taken
#  - checks to see if package.json exists in `dist/esm`. If it does, then the
#    ✨✨✨HYBRID✨✨✨ implementation of ESM has finnally been fixed
#    upstream, and no further action is taken
#  - otherwise, it updates the damn package to support ESM
#

if ! test -e node_modules/ip-address; then
  echo "nothing to fix: we're not using ip-address"
  exit 0
fi

if test "$(cat package.json | jq -cr '.type')" != "module"; then
  echo "nothing to fix: we're not using ESM"
  exit 0
fi

if test "$(cat node_modules/ip-address/package.json | jq -cr '.type')" == "module"; then
  echo "HALLELUJIAH: ip-address is a bona-fide ES module!"
  exit 0
fi

if test -d node_modules/ip-address/dist/esm; then
  if test -r node_modules/ip-address/dist/esm/package.json; then
    echo '✨✨✨HYBRID ESM MODULE✨✨✨ detected.... could ip-address actually be fixed upstream?'
    if test "$(cat node_modules/ip-address/dist/esm/package.json | jq -cr '.type')" == "module"; then
      echo "    nope, it's still a ✨✨✨HYBRID ESM MODULE✨✨✨"
      echo "        (but at least it's not a commonjs module any more)"
      exit 0
    fi
  fi
  
  tmpfile="$(mktemp)"
  cat node_modules/ip-address/package.json | jq -r '. + {"type":"module"}' > "${tmpfile}"
  cat "${tmpfile}" > node_modules/ip-address/package.json
  rm "${tmpfile}"

  echo 'i fixed your ✨✨✨HYBRID ESM MODULE✨✨✨'
  echo "it's not commonjs any more"
  echo 'your welcome'
  exit 0
fi

echo '✨✨✨HYBRID ESM MODULE✨✨✨ not detected'

