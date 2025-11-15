# FILE: py/ai.py
# Brython-KI – dynamischer Top-Down Anime-Stil
from browser import window
import json, math, random

PY_AI_READY = False

def _dir(me, enemy):
    dx = enemy["x"] - me["x"]; dy = enemy["y"] - me["y"]
    dist = (dx*dx + dy*dy) ** 0.5
    ang = math.atan2(dy, dx)
    return dx, dy, dist, ang

def decide_aggressive(state):
    me = state["self"]; enemy = state.get("closestEnemy")
    if not enemy: return "idle"
    cds = state.get("cooldowns", {})
    dx, dy, dist, ang = _dir(me, enemy)

    # Heilung falls low
    if me["hp"] < me["maxHp"] * 0.33 and cds.get("heal",0) <= 0:
        return "heal"

    # Midrange → Dash-Einstieg
    if dist > 220 and cds.get("dash",0) <= 0 and random.random()<0.6:
        return "dash"

    # Sehr nah → Spin (AoE)
    if dist < 90 and cds.get("spin",0) <= 0 and random.random()<0.4:
        return "spin"

    # Nah → Light/Heavy mix
    if dist <= 160:
        return "attack_heavy" if random.random()<0.35 else "attack_light"

    # Bewegung: Annähern + leichtes Kreisen
    return random.choice(["move_towards","strafe_left","strafe_right","move_towards","move_towards"])

def decide_defensive(state):
    me = state["self"]; enemy = state.get("closestEnemy")
    if not enemy: return "idle"
    cds = state.get("cooldowns", {})
    dx, dy, dist, ang = _dir(me, enemy)

    if me["hp"] < me["maxHp"] * 0.45 and cds.get("heal",0) <= 0:
        return "heal"

    if dist < 120:
        # ausweichen / kreisen
        return random.choice(["move_away","strafe_left","strafe_right","move_away","attack_light"])

    if dist > 240 and cds.get("dash",0) <= 0 and random.random()<0.4:
        return "dash"

    # poke
    return "attack_light" if dist < 180 else "move_towards"

def decide_random(state):
    acts = ["idle","move_towards","move_away","strafe_left","strafe_right","dash","attack_light","attack_heavy","spin","heal"]
    return random.choice(acts)

def decide_personality(state):
    """AI basierend auf Personality-Traits (0-10 für jeden Trait)"""
    me = state["self"]
    enemy = state.get("closestEnemy")
    ally = state.get("closestAlly")
    personality = state.get("personality", {})

    # Traits extrahieren (Defaults: 5)
    aggression = personality.get("aggression", 5)
    teamplay = personality.get("teamplay", 5)
    risk_taking = personality.get("riskTaking", 5)
    positioning = personality.get("positioning", 5)
    energy_mgmt = personality.get("energyManagement", 5)

    if not enemy:
        return "idle"

    dx, dy, dist, ang = _dir(me, enemy)
    hp_ratio = me["hp"] / me["maxHp"]
    en_ratio = me["en"] / me["maxEn"]

    # === ENERGY MANAGEMENT ===
    energy_threshold = 0.3 + (energy_mgmt / 30.0)
    low_energy = en_ratio < energy_threshold

    # === ESCAPE/RETREAT (Low HP + High Positioning) ===
    # Use "spin" (3rd skill) if it's a retreat skill when low HP and too close
    escape_threshold = 0.3 - (risk_taking / 50.0)
    if hp_ratio < escape_threshold and positioning >= 6 and dist < 100:
        if random.random() < 0.6:
            return "spin"  # May be retreat skill depending on loadout

    # === HEAL DECISION ===
    # WICHTIG: Keine Cooldown-Checks hier! tryHeal() macht das.
    heal_threshold = 0.5 - (risk_taking / 40.0)
    if hp_ratio < heal_threshold and en_ratio > 0.25:
        return "heal"

    # === TEAMPLAY: Support Ally ===
    if teamplay >= 7 and ally:
        ally_dist = ally.get("dist", 999)
        ally_hp_ratio = ally.get("hp", 100) / 100  # Rough estimate

        # Move towards distant ally
        if ally_dist > 150 and random.random() < (teamplay / 15.0):
            ally_dx = ally["x"] - me["x"]
            ally_dy = ally["y"] - me["y"]
            if abs(ally_dx) > abs(ally_dy):
                return "strafe_left" if ally_dx < 0 else "strafe_right"
            else:
                return "move_towards" if ally_dy > 0 else "move_away"

    # === POSITIONING-BASED RANGE CONTROL ===
    # High positioning = prefer optimal range (kiting)
    # Low positioning = face-tank
    if positioning >= 7:
        # Ranged/Kiting playstyle
        optimal_dist = 110 + (positioning * 8)  # 110-190 range

        if dist < optimal_dist - 50:
            # Too close, kite away
            if random.random() < 0.5:
                return "move_away"
        elif dist > optimal_dist + 70:
            # Too far, close in (but slowly)
            if random.random() < 0.35:
                return "move_towards"
    elif positioning <= 3:
        # Aggressive close-range
        optimal_dist = 60
        if dist > optimal_dist + 40 and random.random() < 0.6:
            return "move_towards"

    # === DASH (Risk-Taking + Gap Closing) ===
    # Use dash to close distance when far away
    dash_chance = 0.25 + (risk_taking / 25.0)
    if aggression >= 6:
        # Aggressive fighters dash in more
        if dist > 180 and random.random() < dash_chance:
            return "dash"
    elif positioning <= 4:
        # Low positioning tanks just walk in
        if dist > 220 and random.random() < (dash_chance * 0.6):
            return "dash"

    # === SPECIAL ATTACKS (Heavy/Spin) ===
    # Spin/AoE at close range
    spin_chance = (aggression + risk_taking) / 40.0
    if dist < 80 and random.random() < spin_chance and not low_energy:
        return "spin"

    # Heavy attack (gap closer or burst)
    heavy_range = 90 + (aggression * 10)
    if dist <= heavy_range and dist > 40:
        heavy_chance = (aggression + risk_taking) / 30.0
        if random.random() < heavy_chance and not low_energy:
            return "attack_heavy"  # May be dash_strike depending on loadout

    # === BASIC ATTACK ===
    # Attack at appropriate range
    if positioning >= 7:
        # Ranged fighters attack from far
        attack_range = 120 + (positioning * 10)
    else:
        # Melee fighters attack close
        attack_range = 70 + (aggression * 8)

    if dist <= attack_range:
        if low_energy or random.random() > (aggression / 15.0):
            return "attack_light"
        else:
            return "attack_heavy" if random.random() < 0.3 else "attack_light"

    # === MOVEMENT ===
    # Defensive fighters keep distance
    safe_distance = 130 - (aggression * 8)
    if aggression <= 4 and dist < safe_distance:
        moves = ["move_away", "strafe_left", "strafe_right", "move_away"]
        return random.choice(moves)

    # Default: Approach with circling (more circling for high positioning)
    if positioning >= 6:
        # Kiting fighters circle more
        moves = ["move_towards", "strafe_left", "strafe_right", "strafe_left", "strafe_right"]
    else:
        # Aggressive fighters rush in
        moves = ["move_towards"] * (aggression // 2 + 1)
        moves += ["strafe_left", "strafe_right"]

    return random.choice(moves)

def PY_AI_DECIDE(profile_id, state_json):
    try:
        state = json.loads(state_json)
    except Exception:
        return "idle"

    # Nutze Personality AI wenn personality vorhanden
    if "personality" in state and state["personality"]:
        return decide_personality(state)

    # Fallback auf alte Profile
    if profile_id == "aggressive":
        return decide_aggressive(state)
    if profile_id == "defensive":
        return decide_defensive(state)
    return decide_random(state)

window.PY_AI_DECIDE = PY_AI_DECIDE
window.PY_AI_READY = True
PY_AI_READY = True
