import { RandomAccessFile } from '../../randomaccessfile/index.js';

const code = 78;
const abbreviation = 'N1P';
const description = 'One-hour precipitation';

// eslint-disable-next-line camelcase
const halfwords30_53 = (data) => {
	// turn data into a random access file for bytewise parsing purposes
	const raf = new RandomAccessFile(data);
	raf.seek(34);
	return {
		maxRainfall: raf.readShort() / 10,
		meanFieldBias: raf.readShort() / 100,
		sampleSize: raf.readShort() / 100,
		endRanifallDate: raf.readShort(),
		endRainfallMinutes: raf.readShort(),
		plot: {
			maxDataValue: 16,
		},
	};
};

const product = {
	code,
	abbreviation,
	description,

	productDescription: {
		halfwords30_53,
	},
};

if (typeof module !== 'undefined') {
	module.exports = product;
}

export default product;
export { code, abbreviation, description, halfwords30_53 };
