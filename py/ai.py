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

    # === HEAL DECISION ===
    # WICHTIG: Keine Cooldown-Checks hier! tryHeal() macht das.
    heal_threshold = 0.5 - (risk_taking / 40.0)
    if hp_ratio < heal_threshold and en_ratio > 0.25:
        return "heal"

    # === TEAMPLAY: Bei Ally bleiben ===
    if teamplay >= 7 and ally:
        ally_dist = ally.get("dist", 999)
        if ally_dist > 150 and random.random() < (teamplay / 15.0):
            ally_dx = ally["x"] - me["x"]
            ally_dy = ally["y"] - me["y"]
            if abs(ally_dx) > abs(ally_dy):
                return "strafe_left" if ally_dx < 0 else "strafe_right"
            else:
                return "move_towards" if ally_dy < 0 else "move_away"

    # === AGGRESSION: Angriffs-Frequenz ===
    attack_range = 100 + (aggression * 15)
    safe_distance = 180 - (aggression * 10)

    # === POSITIONING: Strategische Distanz ===
    if positioning >= 7:
        optimal_dist = 140
        if dist < optimal_dist - 40:
            if random.random() < 0.4:
                return "move_away"
        elif dist > optimal_dist + 60:
            if random.random() < 0.5:
                return "move_towards"

    # === DASH (Risk-Taking) ===
    # Dash hat eigenen Cooldown im Fighter - kein Check nötig
    dash_chance = 0.3 + (risk_taking / 20.0)
    if dist > 200 and random.random() < dash_chance:
        return "dash"

    # === SPIN/AOE (Close Range) ===
    # WICHTIG: Keine Cooldown-Checks! tryAttack() macht das.
    spin_chance = (aggression + risk_taking) / 35.0
    if dist < 100 and random.random() < spin_chance:
        return "spin"

    # === ATTACK DECISION ===
    if dist <= attack_range:
        heavy_chance = aggression / 25.0

        # Energy Management: Wenn low energy, nur Light
        if low_energy:
            return "attack_light"

        # Heavy oder Light basierend auf Aggression
        # Keine Cooldown-Checks - tryAttack() macht das
        if random.random() < heavy_chance:
            return "attack_heavy"
        else:
            return "attack_light"

    # === MOVEMENT ===
    if aggression <= 4 and dist < safe_distance:
        return random.choice(["move_away", "strafe_left", "strafe_right", "move_away"])

    # Default: Annähern mit etwas Kreisen
    moves = ["move_towards"] * (aggression // 2)
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
