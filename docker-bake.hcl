variable "NODE_VERSION" {
    default = null
}

variable "NODE_TEST_VERSION" {
    default = null
}

group "default" {
    targets = ["dist", "types"]
}

group "test-all" {
    targets = ["lint", "test", "test-integration"]
}

group "all" {
    targets = ["dist", "types", "lint", "test", "test-integration"]
}

target "dist" {
    target = "dist"
    output = ["./dist"]
}

target "types" {
    target = "types"
    output = ["./lib/types"]
}

target "lint" {
    target = "lint"
    output = ["type=cacheonly"]
}

target "test" {
    target = "test"
    extra-hosts = {
        "host.docker.internal" = "host-gateway"
    }
    output = ["./out/test"]
}

target "test-integration" {
    name   = "test-integration-node-v${NODE_VERSION}"
    target = "test-integration"
    matrix = {
        NODE_VERSION = ["18", "20", "22"]
    }
    args = {
        NODE_TEST_VERSION = "${NODE_VERSION}"
    }
    extra-hosts = {
        "host.docker.internal" = "host-gateway"
    }
    output = ["./out/test-integration/node-v${NODE_VERSION}"]
}
