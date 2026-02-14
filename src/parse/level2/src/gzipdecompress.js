import zlib from 'zlib';
// structured byte access
import { RandomAccessFile, BIG_ENDIAN } from './classes/RandomAccessFile.js';

export default (raf) => {
	const data = zlib.gunzipSync(raf.buffer);
	return new RandomAccessFile(data, BIG_ENDIAN);
};
