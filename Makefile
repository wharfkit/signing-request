SRC_FILES := $(shell find src -name '*.ts')

all: lib

lib: $(SRC_FILES) node_modules tsconfig.json
	./node_modules/.bin/tsc -p tsconfig.json --outDir lib
	./node_modules/.bin/microbundle --format umd --external eosjs,crypto --no-compress
	touch lib

.PHONY: lint
lint: node_modules
	./node_modules/.bin/tslint -p tsconfig.json -c tslint.json -t stylish --fix

.PHONY: test
test: node_modules
	TS_NODE_PROJECT=./test/tsconfig.json ./node_modules/.bin/mocha --require ts-node/register --extensions ts test/*.ts --grep '$(grep)'

.PHONY: test-umd
test-umd: node_modules lib
	TEST_UMD=1 TS_NODE_PROJECT=./test/tsconfig.json ./node_modules/.bin/mocha --require ts-node/register --extensions ts test/*.ts --grep '$(grep)'

node_modules:
	yarn install --non-interactive --frozen-lockfile --ignore-scripts

.PHONY: clean
clean:
	rm -rf lib/

.PHONY: distclean
distclean: clean
	rm -rf node_modules/
