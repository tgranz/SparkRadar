
import { RandomAccessFile } from '../../randomaccessfile/index.js';

const code = 135;
const abbreviation = ['EET'];
const description = 'Enhanced Echo Tops';

// delta and time are compressed into one field
const deltaTime = (value) => ({
	deltaTime: (value & 0xFFE0) >> 5,
	nonSupplementalScan: (value & 0x001F) === 0,
	sailsScan: (value & 0x001F) === 1,
	mrleScan: (value & 0x001F) === 2,
});

// eslint-disable-next-line camelcase
const halfwords30_53 = (data) => {
	// turn data into a random access file for bytewise parsing purposes
	const raf = new RandomAccessFile(data);
	const dependent30 = raf.readShort();
	const dataMask = raf.readShort();
	const dataScale = raf.readShort();
	const dataOffset = raf.readShort();
	const toppedMask = raf.readShort();

	const decodeEchoTopValue = (packed) => {
		if (!Number.isFinite(packed)) return null;
		if (packed === 0) return null; // below threshold
		if (packed === 1) return null; // bad data

		const scale = Number.isFinite(dataScale) && dataScale !== 0 ? dataScale : 1;
		const value = ((packed & dataMask) / scale) - dataOffset;
		if (!Number.isFinite(value)) return null;

		const topped = (packed & toppedMask) !== 0;
		// Palette convention: topped values are encoded as 150 + value (kft).
		return topped ? 150 + value : value;
	};

    return {
		elevationAngle: 0, // EET has no elevation
		plot: {
			minimumDataValue: 0,
			dataIncrement: 1,
			dataLevels: 199,
			decodeDataLevel: decodeEchoTopValue,
			dataMask,
			dataScale,
			dataOffset,
			toppedMask,
		},
		dependent30,
		dependent35_46: raf.read(24),
		maxEchoTop: raf.readShort(),
		dependent48_49: raf.read(4),
		...deltaTime(raf.readShort()),
		compressionMethod: raf.readShort(),
		uncompressedProductSize: (raf.readUShort() << 16) + raf.readUShort(),
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
