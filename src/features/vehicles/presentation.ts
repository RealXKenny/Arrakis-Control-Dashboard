export function isContainerVehicle(vehicle) {
  return /container/i.test(
    String(
      vehicle?.type ?? vehicle?.vehicleType ?? vehicle?.vehicle_type ?? vehicle?.name ?? vehicle?.vehicleName ?? '',
    ),
  );
}
