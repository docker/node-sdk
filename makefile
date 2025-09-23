generate:
	npm run generate

build:
	npm run build

test:
	npm run typecheck
	npm run test
	npm run format.check
	npm run lint

.PHONY: generate build test