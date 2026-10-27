import { describe, expect, it } from 'vitest';
import { isContainerVehicle } from '../../src/modules/portal/utils/vehicles';

describe('vehicle presentation', () => {
  it('identifies container vehicles by their reported type without matching ordinary vehicles', () => {
    expect(isContainerVehicle({ type: 'BP_ContainerVehicle' })).toBe(true);
    expect(isContainerVehicle({ vehicle_type: 'Cargo Container' })).toBe(true);
    expect(isContainerVehicle({ vehicleName: 'Container Hauler' })).toBe(true);
    expect(isContainerVehicle({ type: 'Assault Ornithopter' })).toBe(false);
    expect(isContainerVehicle({ type: 'Sandbike' })).toBe(false);
    expect(isContainerVehicle(undefined)).toBe(false);
  });
});
