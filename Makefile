SRC_FILES := $(shell find src -name '*.ts')

all: lib

lib: $(SRC_FILES) node_modules tsconfig.json
	./node_modules/.bin/tsc -p tsconfig.json --outDir lib
	./node_modules/.bin/microbundle --format umd --globals fast-sha256=sha256
	touch lib

.PHONY: lint
lint: node_modules
	NODE_ENV=test tslint -p tsconfig.json -c tslint.json -t stylish --fix

.PHONY: test
test: node_modules
	NODE_ENV=test TS_NODE_PROJECT=./test/tsconfig.json ./node_modules/.bin/mocha --require ts-node/register --extensions ts test/*.ts --grep '$(grep)'

node_modules:
	yarn install --non-interactive --frozen-lockfile

.PHONY: clean
clean:
	rm -rf lib/

.PHONY: distclean
distclean: clean
	rm -rf node_modules/
