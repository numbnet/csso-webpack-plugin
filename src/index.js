import csso from 'csso';
import async from 'async';
import RawSource from 'webpack-sources/lib/RawSource';
import SourceMapSource from 'webpack-sources/lib/SourceMapSource';
import { SourceMapConsumer } from 'source-map';

const filterDefault = file => file.endsWith('.css');
const createRegexpFilter = regex => str => regex.test(str);
const isFilterType = inst => typeof inst === 'function' || inst instanceof RegExp;

export default class CssoWebpackPlugin {
    constructor(options, filter) {
        this.options = options;
        this.filter = filter;

        if (isFilterType(this.options) && typeof this.filter === 'undefined') {
            this.filter = options;
            this.options = undefined;
        }

        if (typeof this.filter === 'undefined') {
            this.filter = filterDefault;
        }

        if (typeof this.filter !== 'function') {
            this.filter = createRegexpFilter(filter);
        }

        this.options = this.options || {};
    }

    apply(compiler) {
        compiler.plugin('compilation', compilation => {
            const options = this.options;
            const optSourceMap = options.sourceMap;

            if (optSourceMap) {
                compilation.plugin('build-module', module => {
                    module.useSourceMap = true;
                });
            }

            compilation.plugin('optimize-assets', (assets, callback) => {
                async.forEach(Object.keys(assets), file => {
                    try {
                        if (!this.filter(file)) {
                            return callback();
                        }

                        let source;
                        let sourceMap;

                        const asset = assets[file];

                        if (asset.sourceAndMap) {
                            const sourceAndMap = asset.sourceAndMap();
                            sourceMap = sourceAndMap.map;
                            source = sourceAndMap.source;
                        } else {
                            sourceMap = asset.map();
                            source = asset.source();
                        }

                        if (Buffer.isBuffer(source)) {
                            source = source.toString('utf-8');
                        }

                        let { css, map } = csso.minify(source, { // eslint-disable-line prefer-const
                            ...options,
                            filename: file,
                            sourceMap: typeof optSourceMap !== 'undefined' ? optSourceMap : Boolean(sourceMap),
                        });

                        if (map && sourceMap) {
                            map.applySourceMap(new SourceMapConsumer(sourceMap), file);
                        }

                        if (!map) {
                            map = sourceMap;
                        }

                        if (map) {
                            compilation.assets[file] = new SourceMapSource(css, file, map, source, sourceMap);
                        } else {
                            compilation.assets[file] = new RawSource(css);
                        }
                    } catch (err) {
                        let error = err;
                        const prefix = `${file} from CssoWebpackPlugin\n`;
                        const { message, parseError, stack } = err;

                        if (parseError) {
                            error = `${message} [${file}:${parseError.line}:${parseError.column}]`;
                        } else {
                            error = `${message} ${stack}`;
                        }

                        compilation.errors.push(new Error(`${prefix}${error}`));
                    }

                    return callback();
                });
            });
        });
    }
}
