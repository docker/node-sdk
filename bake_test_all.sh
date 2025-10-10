#!/usr/bin/env bash

set -o errexit   # abort on nonzero exitstatus
set -o nounset   # abort on unbound variable
set -o pipefail  # don't hide errors within pipes

function tearDown {
    docker stop docker-sock-for-bake-test-all
}
trap tearDown EXIT ERR
docker run --rm -d --name docker-sock-for-bake-test-all -p 2375:2375 -v /var/run/docker.sock:/var/run/docker.sock alpine/socat tcp-listen:2375,reuseaddr,fork unix-connect:/var/run/docker.sock
docker buildx bake test-all