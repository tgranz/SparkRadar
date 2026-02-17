import { RandomAccessFile } from '../../randomaccessfile/index.js';
import { key as hydrometeorKey } from '../165/index.js';

const code = 177;
const abbreviation = 'HHC';
const description = 'Hybrid Hydrometeor Classification';

// eslint-disable-next-line camelcase
const halfwords27_28 = (data) => ({
	halfwords27_28: data,
});

// eslint-disable-next-line camelcase
const halfwords30_53 = (data) => {
	// turn data into a random access file for bytewise parsing purposes
	const raf = new RandomAccessFile(data);
	return {
		dependent30_46: raf.read(34),
		modeFilter: raf.readShort(),
		hybridRatePercentBinsFilled: raf.readShort() / 100,
		highestElevation: raf.readShort() / 10,
		dependent50: raf.read(2),
		compressionMethod: raf.readShort(),
		uncompressedSize: (raf.readUShort() << 16) + raf.readUShort(),
		plot: { maxDataValue: 150 },
	};
};

const product = {
	code,
	abbreviation,
	description,
	productDescription: {
		halfwords27_28,
		halfwords30_53,
	},
	supplemental: { key: hydrometeorKey },
};

if (typeof module !== 'undefined') {
	module.exports = product;
}

export default product;
export { code, abbreviation, description, halfwords27_28, halfwords30_53 };
