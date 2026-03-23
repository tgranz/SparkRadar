import bzip from 'seek-bzip';
import { Buffer } from 'buffer';
import * as randomAccessFileModule from './randomaccessfile/index.js';
import * as textHeaderModule from './headers/text.js';
import * as messageHeaderModule from './headers/message.js';
import * as productDescriptionModule from './headers/productdescription.js';
import * as symbologyHeaderModule from './headers/symbology.js';
import * as tabularHeaderModule from './headers/tabular.js';
import graphicHeader from './headers/graphic-browser.js';
import radialPackets from './headers/radialpackets-browser.js';
import * as product56Module from './products/56/index.js';
import * as product58Module from './products/58/index.js';
import * as product59Module from './products/59/index.js';
import * as product61Module from './products/61/index.js';
import * as product62Module from './products/62/index.js';
import * as product78Module from './products/78/index.js';
import * as product80Module from './products/80/index.js';
import * as product94Module from './products/94/index.js';
import * as product99Module from './products/99/index.js';
import * as product141Module from './products/141/index.js';
import * as product153Module from './products/153/index.js';
import * as product154Module from './products/154/index.js';
import * as product159Module from './products/159/index.js';
import * as product161Module from './products/161/index.js';
import * as product163Module from './products/163/index.js';
import * as product165Module from './products/165/index.js';
import * as product170Module from './products/170/index.js';
import * as product172Module from './products/172/index.js';
import * as product177Module from './products/177/index.js';

const toModule = (mod) => mod?.default ?? mod;
const toProduct = (mod) => mod?.default ?? mod;

const { RandomAccessFile } = toModule(randomAccessFileModule);
const textHeader = toModule(textHeaderModule);
const messageHeader = toModule(messageHeaderModule);
const productDescription = toModule(productDescriptionModule);
const parseProductDescription = productDescription?.parse
    ?? productDescription?.parseProductDescription
    ?? productDescription;
const symbologyHeader = toModule(symbologyHeaderModule);
const tabularHeader = toModule(tabularHeaderModule);

const productsRaw = [
    toProduct(product56Module),
    toProduct(product58Module),
    toProduct(product59Module),
    toProduct(product61Module),
    toProduct(product62Module),
    toProduct(product78Module),
    toProduct(product80Module),
    toProduct(product94Module),
    toProduct(product99Module),
    toProduct(product141Module),
    toProduct(product153Module),
    toProduct(product154Module),
    toProduct(product159Module),
    toProduct(product161Module),
    toProduct(product163Module),
    toProduct(product165Module),
    toProduct(product170Module),
    toProduct(product172Module),
    toProduct(product177Module)
];

const products = {};
productsRaw.forEach((product) => {
    if (products[product.code]) {
        throw new Error(`Duplicate product code ${product.code}`);
    }
    products[product.code] = product;
});

const productAbbreviations = productsRaw.map((product) => product.abbreviation).flat();

const combineOptions = (newOptions) => {
    let logger = newOptions?.logger ?? console;
    if (logger === false) logger = nullLogger;
    return {
        parseSymbology: newOptions?.parseSymbology !== false,
        parseGraphic: newOptions?.parseGraphic !== false,
        parseTabular: newOptions?.parseTabular !== false,
        parseFormatted: newOptions?.parseFormatted !== false,
        includeRawBinData: newOptions?.includeRawBinData !== false,
        parseFirstRadialPacketOnly: newOptions?.parseFirstRadialPacketOnly === true,
        minimalOutput: newOptions?.minimalOutput === true,
        ...newOptions,
        logger,
    };
};

const nullLogger = {
    log: () => {},
    error: () => {},
    warn: () => {},
};

const nexradLevel3Data = (file, _options) => {
    const options = combineOptions(_options);
    const minimalOutput = options.minimalOutput === true;

    const raf = new RandomAccessFile(file);
    const result = {};

    const parsedTextHeader = textHeader(raf);
    if (!minimalOutput) {
        result.textHeader = parsedTextHeader;
    }

    const textHeaderLength = raf.getPos();

    if (!parsedTextHeader.fileType.startsWith('SDUS')) {
        throw new Error(`Incorrect file type header: ${parsedTextHeader.fileType}`);
    }
    if (!productAbbreviations.includes(parsedTextHeader.type)) {
        throw new Error(`Unsupported product type: ${parsedTextHeader.type}`);
    }

    const parsedMessageHeader = messageHeader(raf);
    if (!minimalOutput) {
        result.messageHeader = parsedMessageHeader;
    }
    const product = products[parsedMessageHeader.code.toString()];

    if (!product) {
        throw new Error(`Unsupported product code: ${parsedMessageHeader.code}`);
    }

    const parsedProductDescription = parseProductDescription(raf, product);
    result.productDescription = parsedProductDescription;

    let decompressed;
    if (parsedProductDescription.compressionMethod > 0) {
        const rafPos = raf.getPos();
        const compressed = raf.read(raf.getLength() - raf.getPos());
        const data = bzip.decode(compressed);
        raf.seek(0);
        decompressed = new RandomAccessFile(Buffer.concat([
            raf.read(rafPos),
            data,
        ]));
        decompressed.seek(rafPos);
    } else {
        decompressed = raf;
    }

    try {
        if (options.parseSymbology && parsedProductDescription.offsetSymbology !== 0) {
            const offsetSymbologyBytes = textHeaderLength + parsedProductDescription.offsetSymbology * 2;
            if (offsetSymbologyBytes > decompressed.getLength()) {
                throw new Error(`Invalid symbology offset: ${parsedProductDescription.offsetSymbology}`);
            }
            decompressed.seek(offsetSymbologyBytes);

            const parsedSymbology = symbologyHeader(decompressed);
            if (!minimalOutput) {
                result.symbology = parsedSymbology;
            }
            result.radialPackets = radialPackets(decompressed, parsedProductDescription, parsedSymbology.numberLayers, options);
        }
    } catch (error) {
        options.logger.warn(error.stack);
        options.logger.warn('Unable to parse symbology data');
    }

    try {
        if (options.parseGraphic && parsedProductDescription.offsetGraphic !== 0) {
            const offsetGraphicBytes = textHeaderLength + parsedProductDescription.offsetGraphic * 2;
            if (offsetGraphicBytes > decompressed.getLength()) {
                throw new Error(`Invalid graphic offset: ${parsedProductDescription.offsetGraphic}`);
            }
            decompressed.seek(offsetGraphicBytes);
            result.graphic = graphicHeader(decompressed);
        }
    } catch (error) {
        options.logger.warn(error.stack);
        options.logger.warn('Unable to parse graphic data');
    }

    try {
        if (options.parseTabular && parsedProductDescription.offsetTabular !== 0) {
            const offsetTabularBytes = textHeaderLength + parsedProductDescription.offsetTabular * 2;
            if (offsetTabularBytes > decompressed.getLength()) {
                throw new Error(`Invalid tabular offset: ${parsedProductDescription.offsetTabular}`);
            }
            decompressed.seek(offsetTabularBytes);
            result.tabular = tabularHeader(decompressed, product);
        }
    } catch (error) {
        options.logger.warn(error.stack);
        options.logger.warn('Unable to parse tabular data');
    }

    try {
        if (options.parseFormatted) {
            const formatted = product?.formatter?.(result);
            if (formatted) result.formatted = formatted;
        }
    } catch (error) {
        options.logger.warn(error.stack);
        options.logger.warn('Unable to parse formatted tabular data');
    }

    return result;
};

export default nexradLevel3Data;
