# Addressing

Owns the reusable postal-address model.

## Language

**Address** (adresse postale):
A reusable postal address block. The single reusable postal model.
_Avoid_: Entry, ItemAddress, location

**EntityAddress** (adresse d'entité):
The ownership link between an Entity and a reusable Address.
_Avoid_: ItemAddress

**Blank recipient**: A snapshot typed by hand with no entity behind it.
