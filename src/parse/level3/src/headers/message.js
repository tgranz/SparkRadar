const parse = (raf) => ({

	code: raf.readShort(),
	julianDate: raf.readShort(),
	seconds: raf.readInt(),
	length: raf.readInt(),
	source: raf.readShort(),
	dest: raf.readShort(),
	blocks: raf.readShort(),

});

if (typeof module !== 'undefined') {
	module.exports = parse;
}

export default parse;
