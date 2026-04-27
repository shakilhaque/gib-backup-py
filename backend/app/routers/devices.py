"""
Device CRUD endpoints.

POST   /devices          – add a single device
POST   /devices/bulk     – add multiple devices at once
GET    /devices          – list all devices (filterable)
GET    /devices/groups   – list distinct group names
PUT    /devices/{id}     – update a device
DELETE /devices/{id}     – delete a device
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.device import AuthType, Device
from app.models.user import User
from app.schemas.device import (
    BulkDeviceCreate,
    DeviceCreate,
    DeviceResponse,
    DeviceUpdate,
)
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/devices", tags=["Devices"])
logger = logging.getLogger(__name__)


@router.post("", response_model=DeviceResponse, status_code=status.HTTP_201_CREATED)
def create_device(payload: DeviceCreate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """Add a new device.  IP must be unique."""
    if db.query(Device).filter(Device.ip_address == payload.ip_address).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Device with IP {payload.ip_address} already exists",
        )
    device = Device(**payload.model_dump())
    db.add(device)
    db.commit()
    db.refresh(device)
    logger.info("Created device: %s", device)
    return device


@router.post("/bulk", status_code=status.HTTP_201_CREATED)
def bulk_create_devices(payload: BulkDeviceCreate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """
    Add multiple devices in one request.
    Returns a summary of created vs skipped (duplicate IP) entries.
    """
    created, skipped = [], []
    existing_ips = {row.ip_address for row in db.query(Device.ip_address).all()}

    for entry in payload.devices:
        if entry.ip_address in existing_ips:
            skipped.append(entry.ip_address)
            continue
        device = Device(**entry.model_dump())
        db.add(device)
        existing_ips.add(entry.ip_address)
        created.append(entry.ip_address)

    db.commit()
    return {"created": len(created), "skipped": len(skipped), "ips_created": created, "ips_skipped": skipped}


@router.get("", response_model=list[DeviceResponse])
def list_devices(
    group_name: Optional[str] = Query(None),
    auth_type: Optional[AuthType] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """List devices with optional filtering by group_name and/or auth_type."""
    query = db.query(Device)
    if group_name:
        query = query.filter(Device.group_name == group_name)
    if auth_type:
        query = query.filter(Device.auth_type == auth_type)
    return query.order_by(Device.group_name, Device.ip_address).all()


@router.get("/groups", response_model=list[str])
def list_groups(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """Return all distinct group names (for dropdowns)."""
    rows = db.query(Device.group_name).distinct().order_by(Device.group_name).all()
    return [r[0] for r in rows]


@router.get("/{device_id}", response_model=DeviceResponse)
def get_device(device_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@router.put("/{device_id}", response_model=DeviceResponse)
def update_device(device_id: int, payload: DeviceUpdate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    update_data = payload.model_dump(exclude_none=True)

    # Check for IP collision if the IP is being changed
    if "ip_address" in update_data and update_data["ip_address"] != device.ip_address:
        if db.query(Device).filter(Device.ip_address == update_data["ip_address"]).first():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"IP {update_data['ip_address']} is already used by another device",
            )

    for field, value in update_data.items():
        setattr(device, field, value)

    db.commit()
    db.refresh(device)
    return device


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_device(device_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    db.delete(device)
    db.commit()
    logger.info("Deleted device id=%d ip=%s", device_id, device.ip_address)
