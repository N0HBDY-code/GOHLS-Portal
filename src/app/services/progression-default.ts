// src/app/services/progression-defaults.ts

export function getDefaultAttributes(position: string): Record<string, number> {
    if (position === 'G') {
      return {
        'GLV LOW': 50,
        'GLV HIGH': 50,
        'STK LOW': 50,
        'STK HIGH': 50,
        '5 HOLE': 50,
        'SPEED': 50,
        'AGILITY': 50,
        'CONSIS': 50,
        'PK CHK': 50,
        'ENDUR': 50,
        'BRK AWAY': 50,
        'RBD CTRL': 50,
        'RECOV': 50,
        'POISE': 50,
        'PASSING': 50,
        'ANGLES': 50,
        'PK PL FRQ': 50,
        'AGGRE': 50,
        'DRBLTY': 50,
        'VISION': 50,
        'OVERALL': 50
      };
    } else {
      return {
        'SPEED': 50,
        'BODY CHK': 50,
        'ENDUR': 50,
        'PK CTRL': 50,
        'PASSING': 50,
        'SHT/PSS': 50,
        'SLAP PWR': 50,
        'SLAP ACC': 50,
        'WRI PWR': 50,
        'WRI ACC': 50,
        'AGILITY': 50,
        'STRENGTH': 50,
        'ACCEL': 50,
        'BALANCE': 50,
        'FACEOFF': 50,
        'DRBLTY': 50,
        'DEKE': 50,
        'AGGRE': 50,
        'POISE': 50,
        'HND EYE': 50,
        'SHT BLK': 50,
        'OFF AWR': 50,
        'DEF AWR': 50,
        'DISCIP': 50,
        'FIGHTING': 50,
        'STK CHK': 50,
        'SAVED': 0,
        'MISSED': 0,
        'OVERALL': 50
      };
    }
  }