// parse message type 1
const shouldParseMoment = (options, momentName) => !options?.includeMoments
	|| options.includeMoments.has(momentName);

export default (raf, message, options) => {
	// record starting offset
	const startingOffset = raf.getPos();

	message.record = {
		mseconds: raf.readInt(),
		julian_date: raf.readShort(),
		unambiguous_range: raf.readShort() / 10,
		azimuth: raf.readShort() / 8 * 0.043945,
		azimuth_number: raf.readShort(),
		radial_status: raf.readShort(),
		elevation_angle: raf.readShort() / 8 * 0.043945,
		elevation_number: raf.readShort(),
		surveillance_range: raf.readSignedInt() / 1000,
		doppler_range: raf.readSignedInt() / 1000,
		surveillance_range_sample_interval: raf.readSignedInt() / 1000,
		doppler_range_sample_interval: raf.readSignedInt() / 1000,
		number_of_surveillance_bins: raf.readShort(),
		number_of_doppler_bins: raf.readShort(),
		cut_sector_number: raf.readShort(),
		calibration_constant: raf.readFloat(),
		surveillance_pointer: raf.readShort(),
		velocity_pointer: raf.readShort(),
		spectral_width_pointer: raf.readShort(),
		doppler_velocity_resolution: raf.readShort() * 0.25,
		vcp: raf.readShort(),
		spare1: raf.read(8),
		spare2: raf.readShort(),
		spare3: raf.readShort(),
		spare4: raf.readShort(),
		nyquist_velocity: raf.readShort() / 100,
		atoms: raf.readShort() / 1000,
		tover: raf.readShort() / 10,
		radial_spot_blanking_status: raf.readShort(),
		spare5: raf.read(32),
	};

	// process reflectivity
	if (message.record.surveillance_pointer > 0 && shouldParseMoment(options, 'reflect')) {
		// jump to offset
		raf.seek(startingOffset + message.record.surveillance_pointer);

		// error checking
		try {
			if (raf.getPos() > raf.getLength()) throw new Error('Message Type 1: Invalid surveillance (reflectivity) offset');
			if ((raf.getPos() + message.record.number_of_surveillance_bins) >= raf.getLength()) throw new Error('Message Type 1: Invalid surveillance (reflectivity) length');

			// extract the data
			const reflectivity = new Array(message.record.number_of_surveillance_bins);
			for (let i = 0; i < message.record.number_of_surveillance_bins; i += 1) {
				const bin = raf.read();
				// per documentation 0 = below threshold, 1 = range folding
				if (bin >= 2) {
					reflectivity[i] = (bin / 2.0) - 33.0;
				} else {
					reflectivity[i] = null;
				}
			}
			message.record.reflect = reflectivity;
		} catch (e) {
			options.logger.warn(e.message);
		}
	}

	// process velocity
	if (message.record.velocity_pointer > 0 && shouldParseMoment(options, 'velocity')) {
		// jump to offset
		raf.seek(startingOffset + message.record.velocity_pointer);

		// error checking
		try {
			if (raf.getPos() > raf.getLength()) throw new Error('Message Type 1: Invalid doppler (velocity) offset');
			if ((raf.getPos() + message.record.number_of_doppler_bins) >= raf.getLength()) throw new Error('Message Type 1: Invalid doppler (velocity) length');

			// extract the data
			const velocity = new Array(message.record.number_of_doppler_bins);
			const resolution = message.record.doppler_velocity_resolution;
			for (let i = 0; i < message.record.number_of_doppler_bins; i += 1) {
				const bin = raf.read();
				// per documentation 0 = below threshold, 1 = range folding
				if (bin >= 2) {
					velocity[i] = (bin - 127) * resolution;
				} else {
					velocity[i] = null;
				}
			}
			message.record.velocity = velocity;
		} catch (e) {
			options.logger.warn(e.message);
		}
	}
	// process spectrum width
	if (message.record.spectral_width_pointer > 0) {
		raf.skip(message.record.spare4);
	}

	return message;
};
