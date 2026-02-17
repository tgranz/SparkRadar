import { RandomAccessFile } from '../../randomaccessfile/index.js';

const code = 161;
const abbreviation = ['NXC', 'NYC', 'NZC', 'N0C', 'NAC', 'N1C', 'NBC', 'N2C', 'N3C'];
const description = 'Digital Correlation Coefficient';

// eslint-disable-next-line camelcase
const halfwords27_28 = (data) => {
	// turn data into a random access file for bytewise parsing purposes
	const raf = new RandomAccessFile(data);
	return {
		thresholdMinTime: raf.readShort(),
		totalTime: raf.readShort(),
	};
};

// eslint-disable-next-line camelcase
const halfwords30_53 = (data) => {
	// turn data into a random access file for bytewise parsing purposes
	const raf = new RandomAccessFile(data);

	return {
		elevationAngle: raf.readShort() / 10,
		plot: {
			scale: raf.readFloat(),
			offset: raf.readFloat(),
			dependent35: raf.readShort(),
			maxDataValue: raf.readShort(),
			leadingFlags: leadingFlags(raf.readShort()),
			trailingFlags: raf.readShort(),
		},
		dependent39_46: raf.read(16),
		min: raf.readShort() / 10,
		max: raf.readShort() / 10,
		deltaTime: raf.readShort(),
		compressionMethod: raf.readShort(),
		uncompressedSizeMSW: (raf.readUShort() << 16) + raf.readUShort(),
		uncompressedSizeLSW: raf.readUShort(),
	};
};

const leadingFlags = (data) => ({
	noData: data & 0x01 === 0,
});

const product = {
	code,
	abbreviation,
	description,
	productDescription: {
		halfwords27_28,
		halfwords30_53,
	},
};

if (typeof module !== 'undefined') {
	module.exports = product;
}

export default product;
export { code, abbreviation, description, halfwords27_28, halfwords30_53 };
