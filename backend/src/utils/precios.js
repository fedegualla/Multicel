/**
 * Calcula el precio de venta a partir del costo, el % de ganancia y el % de IVA.
 * Orden: costo -> + ganancia -> + IVA sobre ese total -> redondeo a $100.
 */
export function calcularPrecioVenta(precioCosto, porcentajeGanancia, porcentajeIva) {
  const conGanancia = precioCosto * (1 + porcentajeGanancia / 100);
  const conIva = conGanancia * (1 + porcentajeIva / 100);
  return Math.round(conIva / 100) * 100;
}
