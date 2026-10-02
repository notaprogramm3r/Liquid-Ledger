/*
 * Pool chemistry dosing engine.
 *
 * All formulas below are the widely-used rules of thumb from pool-care
 * communities (Trouble Free Pool / PoolMath style charts). They are good
 * planning estimates, NOT lab-exact. Always add chemicals gradually,
 * retest, and follow the product label — this app is a calculator and
 * logbook, not a substitute for testing.
 *
 * Convention: every "per 10,000 gallons" figure is scaled by
 * (poolGallons / 10000) and by how many ppm/0.1-steps are needed.
 */

const CHEM = (() => {

  // ---- Target ranges (defaults, user-editable in Settings) ----
  const DEFAULT_TARGETS = {
    fc:   { min: 3,   max: 5,   ideal: 4   }, // ppm free chlorine
    ph:   { min: 7.4, max: 7.6, ideal: 7.5 },
    ta:   { min: 80,  max: 120, ideal: 100 }, // ppm
    cya:  { min: 30,  max: 50,  ideal: 40  }, // ppm stabilizer
    ch:   { min: 200, max: 400, ideal: 250 }, // ppm calcium hardness
    salt: { min: 2700,max: 3400,ideal: 3200}, // ppm (only if SWG enabled)
    temp: { min: 78,  max: 84,  ideal: 80  }, // °F, comfort range — not dosed, just tracked
    tc:   { min: 1,   max: 10,  ideal: 3   }, // ppm total chlorine — not dosed directly (it's FC + combined); tracked so combined can be derived/checked
    cc:   { min: 0,   max: 0.2, ideal: 0   }, // ppm combined chlorine (chloramines) — above ~0.2-0.5 ppm means it's time to shock; not dosed, just tracked
    br:   { min: 3,   max: 5,   ideal: 4   }, // ppm bromine — typical spa/pool range for bromine used as the primary sanitizer instead of chlorine; not dosed here, just tracked
    orp:  { min: 650, max: 750, ideal: 700 }  // mV oxidation-reduction potential — a sanitizer-independent read on disinfecting power; not dosed, just tracked
  };

  const per10k = (gallons) => gallons / 10000;

  // ---------- FREE CHLORINE ----------
  // oz (fluid) or oz (weight) needed per 10,000 gal to raise FC by 1 ppm
  const FC_RAISERS = {
    liquid10:  { label: 'Liquid Chlorine (10%)',        unit: 'fl oz', perPpmPer10k: 12.8 },
    liquid125: { label: 'Liquid Chlorine (12.5%)',      unit: 'fl oz', perPpmPer10k: 10.2 },
    calhypo65: { label: 'Cal-Hypo (65%)',                unit: 'oz wt', perPpmPer10k: 2.0 },
    dichlor56: { label: 'Dichlor (56%) granular',        unit: 'oz wt', perPpmPer10k: 2.4 },
    trichlor90:{ label: 'Trichlor (90%) pucks/granular', unit: 'oz wt', perPpmPer10k: 1.6 }
  };

  // ---------- BROMINE ----------
  // Bromine isn't dosed by a formula here (feeders/floaters are set-and-
  // check, not a one-time addition like liquid chlorine) — this list just
  // names the common ways people run bromine, for the sanitizer-type
  // picker in Settings, which in turn decides whether Bromine or Chlorine
  // testing (or both) shows up on the Log form.
  const BR_PRODUCTS = {
    brtabs:    { label: 'Bromine Tablets (BCDMH) + Feeder' },
    brtwopart: { label: 'Two-Part Bromine (Sodium Bromide + Oxidizer/Shock)' },
    brliquid:  { label: 'Liquid Bromine Concentrate' },
    brstick:   { label: 'Bromine Sticks/Cartridge (floating dispenser)' }
  };

  function doseFC(gallons, current, target, product) {
    const p = FC_RAISERS[product] || FC_RAISERS.liquid125;
    const diff = target - current;
    if (diff <= 0) {
      return { needed: false, message: 'FC is at or above target — no chlorine addition needed.' };
    }
    const amount = diff * p.perPpmPer10k * per10k(gallons);
    return {
      needed: true,
      amount: round(amount),
      unit: p.unit,
      product: p.label,
      message: `Add ${round(amount)} ${p.unit} of ${p.label} to raise FC from ${current} to ${target} ppm.`
    };
  }

  // ---------- pH ----------
  // Muriatic acid (31.45%) fl oz per 10,000 gal to lower pH by 0.2, bracketed by TA
  const MURIATIC_LOWER_PER_0_2 = [
    { max: 40,  oz: 5  },
    { max: 80,  oz: 8  },
    { max: 120, oz: 10 },
    { max: 160, oz: 13 },
    { max: Infinity, oz: 15 }
  ];
  // Soda ash oz per 10,000 gal to raise pH by 0.2 (also raises TA slightly ~4ppm per dose)
  const SODA_ASH_RAISE_PER_0_2 = 6;

  function doseTAforBracket(ta) {
    return MURIATIC_LOWER_PER_0_2.find(b => ta <= b.max).oz;
  }

  function dosePH(gallons, current, target, ta) {
    const diff = round2(target - current);
    if (Math.abs(diff) < 0.05) {
      return { needed: false, message: 'pH is already at target.' };
    }
    if (diff < 0) {
      // need to lower pH -> muriatic acid, dependent on TA
      const ozPer02 = doseTAforBracket(ta != null ? ta : 100);
      const steps = Math.abs(diff) / 0.2;
      const amount = steps * ozPer02 * per10k(gallons);
      return {
        needed: true,
        amount: round(amount),
        unit: 'fl oz',
        product: 'Muriatic Acid (31.45%)',
        message: `Add ${round(amount)} fl oz Muriatic Acid (31.45%) to lower pH from ${current} to ${target} (based on TA ≈ ${ta != null ? ta : 100} ppm).`
      };
    } else {
      const steps = diff / 0.2;
      const amount = steps * SODA_ASH_RAISE_PER_0_2 * per10k(gallons);
      return {
        needed: true,
        amount: round(amount),
        unit: 'oz wt',
        product: 'Soda Ash (sodium carbonate)',
        message: `Add ${round(amount)} oz Soda Ash to raise pH from ${current} to ${target}. Note: this will also raise TA slightly — retest TA after.`
      };
    }
  }

  // ---------- TOTAL ALKALINITY ----------
  // Baking soda (sodium bicarbonate): 1.4 lb per 10,000 gal raises TA by 10 ppm
  function doseTA(gallons, current, target) {
    const diff = target - current;
    if (diff <= 0) {
      return {
        needed: diff < 0,
        lowering: diff < 0,
        message: diff < 0
          ? 'TA is above target. Lowering TA requires adding muriatic acid to lower pH sharply, then aerating (fountains/waterfall) to bring pH back up without raising TA again. This is a slower multi-step process — see notes.'
          : 'TA is at or above target — no baking soda needed.'
      };
    }
    const lbs = (diff / 10) * 1.4 * per10k(gallons);
    return {
      needed: true,
      amount: round(lbs, 2),
      unit: 'lb',
      product: 'Baking Soda (sodium bicarbonate)',
      message: `Add ${round(lbs, 2)} lb Baking Soda to raise TA from ${current} to ${target} ppm.`
    };
  }

  // ---------- CYANURIC ACID (stabilizer) ----------
  // Granular stabilizer: 13 oz per 10,000 gal raises CYA by 10 ppm
  function doseCYA(gallons, current, target) {
    const diff = target - current;
    if (diff <= 0) {
      if (diff < 0) {
        const pct = 1 - (target / current);
        const drain = round(pct * gallons);
        return {
          needed: true,
          lowering: true,
          message: `CYA is above target. CYA only comes down by dilution — draining and refilling about ${Math.round(pct * 100)}% of the pool (~${drain} gal) will bring it from ${current} to about ${target} ppm.`
        };
      }
      return { needed: false, message: 'CYA is at or above target — no stabilizer needed.' };
    }
    const oz = (diff / 10) * 13 * per10k(gallons);
    return {
      needed: true,
      amount: round(oz),
      unit: 'oz wt',
      product: 'Cyanuric Acid (stabilizer/conditioner)',
      message: `Add ${round(oz)} oz Cyanuric Acid to raise CYA from ${current} to ${target} ppm. Dissolves slowly — add via skimmer sock, recheck in a week.`
    };
  }

  // ---------- CALCIUM HARDNESS ----------
  // Calcium chloride dihydrate: 1.25 lb per 10,000 gal raises CH by 10 ppm
  function doseCH(gallons, current, target) {
    const diff = target - current;
    if (diff <= 0) {
      if (diff < 0) {
        const pct = 1 - (target / current);
        const drain = round(pct * gallons);
        return {
          needed: true,
          lowering: true,
          message: `CH is above target. Calcium only comes down by dilution — draining and refilling about ${Math.round(pct * 100)}% of the pool (~${drain} gal) will bring it from ${current} to about ${target} ppm.`
        };
      }
      return { needed: false, message: 'CH is at or above target — no calcium chloride needed.' };
    }
    const lbs = (diff / 10) * 1.25 * per10k(gallons);
    return {
      needed: true,
      amount: round(lbs, 2),
      unit: 'lb',
      product: 'Calcium Chloride (dihydrate)',
      message: `Add ${round(lbs, 2)} lb Calcium Chloride to raise CH from ${current} to ${target} ppm. Pre-dissolve in a bucket of water before adding.`
    };
  }

  // ---------- SALT (for saltwater chlorine generators) ----------
  // Exact: lbs = gallons * ppm_change * 8.34 / 1,000,000
  function doseSalt(gallons, current, target) {
    const diff = target - current;
    if (diff <= 0) {
      if (diff < 0) {
        const pct = 1 - (target / current);
        const drain = round(pct * gallons);
        return {
          needed: true,
          lowering: true,
          message: `Salt is above target. Salt only comes down by dilution — draining and refilling about ${Math.round(pct * 100)}% of the pool (~${drain} gal) will bring it from ${current} to about ${target} ppm.`
        };
      }
      return { needed: false, message: 'Salt is at or above target — no salt needed.' };
    }
    const lbs = gallons * diff * 8.34 / 1000000;
    return {
      needed: true,
      amount: round(lbs, 1),
      unit: 'lb',
      product: 'Pool Salt (NaCl, 99%+ pure)',
      message: `Add ${round(lbs, 1)} lb Pool Salt to raise salt from ${current} to ${target} ppm. Add over the shallow end with pump running, brush to help dissolve.`
    };
  }

  function round(n, dp = 1) {
    const f = Math.pow(10, dp);
    return Math.round(n * f) / f;
  }
  function round2(n) { return Math.round(n * 100) / 100; }

  function statusFor(value, range) {
    if (value == null || isNaN(value)) return 'unknown';
    if (value < range.min) return 'low';
    if (value > range.max) return 'high';
    return 'ok';
  }

  return {
    DEFAULT_TARGETS,
    FC_RAISERS,
    BR_PRODUCTS,
    doseFC,
    dosePH,
    doseTA,
    doseCYA,
    doseCH,
    doseSalt,
    statusFor,
    round
  };
})();
