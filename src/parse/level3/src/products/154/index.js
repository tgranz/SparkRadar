// This is just a slightly modified copy of the digital base ref file

import { RandomAccessFile } from '../../randomaccessfile/index.js';

const code = 154;
const abbreviation = ['NXG', 'NYG', 'NZG', 'N0G', 'NAG', 'N1G'];
const description = 'Super Resolution Base Velocity';

// eslint-disable-next-line camelcase
const halfwords30_53 = (data) => {
	// turn data into a random access file for bytewise parsing purposes
	const raf = new RandomAccessFile(data);
	return {
		elevationAngle: raf.readShort() / 10,
		plot: {
			minimumDataValue: raf.readShort() / 10,
			dataIncrement: raf.readShort() / 10,
			dataLevels: raf.readShort(),
		},
		dependent34_46: raf.read(26),
		maxVelocity: raf.readShort(),
		dependent48_49: raf.read(4),
		...deltaTime(raf.readShort()),
		compressionMethod: raf.readShort(),
		uncompressedProductSize: (raf.readUShort() << 16) + raf.readUShort(),
	};
};

// delta and time are compressed into one field
const deltaTime = (value) => ({
	deltaTime: (value & 0xFFE0) >> 5,
	nonSupplementalScan: (value & 0x001F) === 0,
	sailsScan: (value & 0x001F) === 1,
	mrleScan: (value & 0x001F) === 2,
});

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
