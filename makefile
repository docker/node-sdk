.PHONY: install
install:
	npm install
	cd test-integration/cjs-project && npm install
	cd test-integration/esm-project && npm install

.PHONY: build
build: install
	npm run build

.PHONY: test
test: install
	npm run typecheck
	npm run test
	npm run format.check
	npm run lint

.PHONY: test-integration
test-integration: build
	cd test-integration/cjs-project && npm install --install-links=false && npm test
	cd test-integration/esm-project && npm install --install-links=false && npm test

.PHONY: test-all
test-all: test test-integration

.PHONY: bake-build
bake-build:
	docker buildx bake

.PHONY: bake-test-all
bake-test-all:
	./bake_test_all.sh

.PHONY: nuke
nuke:
	rm -Rf dist
	rm -Rf node_modules
	cd test-integration/esm-project && rm -Rf node_modules package-lock.json
	cd test-integration/cjs-project && rm -Rf node_modules package-lock.json