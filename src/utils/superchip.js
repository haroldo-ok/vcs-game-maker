'use strict';

// Superchip RAM only exists on the standard kernel: the setting is kept as it is when the kernel is changed to DPC+, and ignored there.
export const superchipOn = (config) => !!(config && config.enableSuperchip && config.kernel !== 'dpcplus');
