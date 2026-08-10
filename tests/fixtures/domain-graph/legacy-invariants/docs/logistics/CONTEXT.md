# Logistics

### Shipment
A batch of ordered goods dispatched to one address in one carrier handover.

Invariant: a Shipment is dispatched to exactly one address.
Invariant: a dispatched Shipment can no longer change its carrier.

### Pick List
The ordered set of warehouse locations a picker visits to assemble one Shipment.

Invariant: a Pick List belongs to exactly one Shipment.
