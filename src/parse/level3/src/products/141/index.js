import formatter from './formatter.js';
import { RandomAccessFile } from '../../randomaccessfile/index.js';

const code = 141;
const abbreviation = ['NMD'];
const description = 'Mesocyclone';

// 124 Nmi, Geographic and Non-geographic alphanumeric

// eslint-disable-next-line camelcase
const halfwords27_28 = (data) => {
	const raf = new RandomAccessFile(data);
	return {
		minimumReflectivity: raf.readShort(),
		overlapDisplayFilter: raf.readShort(),
	};
};

// eslint-disable-next-line camelcase
const halfwords30_53 = (data) => {
	const raf = new RandomAccessFile(data);
	return {
		filterStrengthRank: raf.readShort(),
	};
};

const product = {
	code,
	abbreviation,
	description,
	formatter,
	productDescription: {
		halfwords27_28,
		halfwords30_53,
	},
};

if (typeof module !== 'undefined') {
	module.exports = product;
}

export default product;
export { code, abbreviation, description, formatter, halfwords27_28, halfwords30_53 };
