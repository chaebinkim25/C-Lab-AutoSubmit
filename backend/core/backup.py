# server/core/backup.py
import asyncio
import os
import boto3
from datetime import datetime
from core.logger import logger
from core.log_messages import LogMsg

async def backup_worker(interval_seconds: int = 3600):
    logger.info(LogMsg.BKP_START.format(interval_seconds=interval_seconds))

    volume_id = os.getenv("AWS_VOLUME_ID")
    region = os.getenv("AWS_REGION", "ap-northeast-2")
    
    if not volume_id or volume_id == "vol-xxxxxxxxxxxxxxxxx":
        logger.warning("AWS_VOLUME_ID is not configured. EBS snapshot backups are disabled.")
        return

    while True:
        try:
            await asyncio.sleep(interval_seconds)
            
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            description = f"C-Lab DB Backup {timestamp}"

            def create_snapshot():
                ec2 = boto3.client('ec2', region_name=region)
                response = ec2.create_snapshot(
                    VolumeId=volume_id,
                    Description=description,
                    TagSpecifications=[
                        {
                            'ResourceType': 'snapshot',
                            'Tags': [
                                {'Key': 'Name', 'Value': f"clab-shards-backup-{timestamp}"},
                                {'Key': 'Project', 'Value': 'C-Lab'}
                            ]
                        }
                    ]
                )
                return response['SnapshotId']

            snapshot_id = await asyncio.to_thread(create_snapshot)
            logger.info(LogMsg.BKP_SUCCESS.format(snapshot_id=snapshot_id))

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(LogMsg.BKP_FAIL.format(error=str(e)))
