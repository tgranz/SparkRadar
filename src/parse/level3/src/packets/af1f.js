const code = 0xaf1f;
const description = 'Radial Data Packet (16 Data Levels)';

const parser = (raf, productDescription, options = {}) => {
	// packet header
	const packetCode = raf.readUShort();

	// test packet code
	if (packetCode !== code) throw new Error(`Packet codes do not match ${code} !== ${packetCode}`);

	// parse the data
	const result = {
		firstBin: raf.readShort(),
		numberBins: raf.readShort(),
		iSweepCenter: raf.readShort(),
		jSweepCenter: raf.readShort(),
		rangeScale: raf.readShort() / 1000,
		numRadials: raf.readShort(),
	};
	if (options.includePacketMetadata !== false) {
		result.packetCodeHex = packetCode.toString(16);
	}

	// loop through the radials and bins
	// return a structure of [radial][bin]
	const radials = new Array(result.numRadials);
	for (let r = 0; r < result.numRadials; r += 1) {
		// get the rle length
		const rleLength = raf.readShort() * 2;
		const bins = new Array(result.numberBins);
		const radial = {
			startAngle: raf.readShort() / 10,
			angleDelta: raf.readShort() / 10,
			bins,
		};
		let binIndex = 0;
		for (let i = 0; i < rleLength; i += 1) {
			const value = raf.readByte();
			const run = value >> 4;
			const data = value & 0x0F;
			const nextBinIndex = Math.min(binIndex + run, result.numberBins);
			if (nextBinIndex > binIndex) {
				bins.fill(data, binIndex, nextBinIndex);
				binIndex = nextBinIndex;
			}
			if (binIndex >= result.numberBins) {
				continue;
			}
		}
		if (binIndex < result.numberBins) {
			bins.length = binIndex;
		}
		radials[r] = radial;
	}
	result.radials = radials;

	return result;
};

const packet = {
	code,
	description,
	parser,
};

if (typeof module !== 'undefined') {
	module.exports = packet;
}

export default packet;
export { code, description, parser };
